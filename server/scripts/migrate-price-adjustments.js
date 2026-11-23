/**
 * Migración idempotente: ajuste de aranceles por inflación (#711).
 *
 * Crea la tabla price_changes, la función fn_round_price y el procedimiento
 * proc_apply_price_increase en una base ya existente. `scripts/setup.sh` solo
 * carga server/01-schema.sql cuando la base está vacía, por lo que este script
 * es la vía para instalaciones en producción.
 *
 * Uso: node server/scripts/migrate-price-adjustments.js
 *
 * Requiere un usuario con privilegios para crear rutinas (CREATE ROUTINE).
 */

const { pool, dbReady } = require('../db');

const CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS price_changes (
  id int(11) NOT NULL AUTO_INCREMENT,
  batch_id char(36) NOT NULL,
  changed_at timestamp NOT NULL DEFAULT current_timestamp(),
  scope enum('doctors','institutions') NOT NULL,
  target_id int(11) NOT NULL,
  field varchar(50) NOT NULL,
  old_value decimal(10,2) NOT NULL,
  new_value decimal(10,2) NOT NULL,
  percent decimal(6,3) DEFAULT NULL,
  rounding_step int(11) DEFAULT NULL,
  inflation_source varchar(50) DEFAULT NULL,
  inflation_period varchar(7) DEFAULT NULL,
  user_id int(11) DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_batch (batch_id),
  KEY idx_target (scope, target_id, field)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const CREATE_FUNCTION = `
CREATE FUNCTION fn_round_price(p_value DECIMAL(10,2), p_step INT) RETURNS decimal(10,2)
    DETERMINISTIC
BEGIN
    IF p_step IS NULL OR p_step <= 0 THEN
        RETURN p_value;
    END IF;
    RETURN CEIL(p_value / p_step) * p_step;
END
`;

const CREATE_PROCEDURE = `
CREATE PROCEDURE proc_apply_price_increase(
    IN p_batch_id CHAR(36),
    IN p_percent DECIMAL(10,4),
    IN p_step INT,
    IN p_scope_doctors TINYINT(1),
    IN p_scope_institutions TINYINT(1),
    IN p_inflation_source VARCHAR(50),
    IN p_inflation_period VARCHAR(7),
    IN p_user_id INT
)
    MODIFIES SQL DATA
BEGIN
    DECLARE v_factor DECIMAL(12,6);

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    IF p_percent IS NULL OR p_percent <= -100 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'percent must be greater than -100';
    END IF;

    IF p_batch_id IS NULL OR CHAR_LENGTH(p_batch_id) = 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'batch_id is required';
    END IF;

    SET v_factor = 1 + (p_percent / 100);

    START TRANSACTION;

    IF p_scope_doctors = 1 THEN
        INSERT INTO price_changes (
            batch_id, scope, target_id, field, old_value, new_value,
            percent, rounding_step, inflation_source, inflation_period, user_id
        )
        SELECT p_batch_id, 'doctors', d.id, 'consultation_price', d.consultation_price,
               fn_round_price(d.consultation_price * v_factor, p_step),
               p_percent, p_step, p_inflation_source, p_inflation_period, p_user_id
          FROM doctors d WHERE d.consultation_price > 0
        UNION ALL
        SELECT p_batch_id, 'doctors', d.id, 'prescription_price', d.prescription_price,
               fn_round_price(d.prescription_price * v_factor, p_step),
               p_percent, p_step, p_inflation_source, p_inflation_period, p_user_id
          FROM doctors d WHERE d.prescription_price > 0
        UNION ALL
        SELECT p_batch_id, 'doctors', d.id, 'medical_license_price', d.medical_license_price,
               fn_round_price(d.medical_license_price * v_factor, p_step),
               p_percent, p_step, p_inflation_source, p_inflation_period, p_user_id
          FROM doctors d WHERE d.medical_license_price > 0
        UNION ALL
        SELECT p_batch_id, 'doctors', d.id, 'certificate_price', d.certificate_price,
               fn_round_price(d.certificate_price * v_factor, p_step),
               p_percent, p_step, p_inflation_source, p_inflation_period, p_user_id
          FROM doctors d WHERE d.certificate_price > 0
        UNION ALL
        SELECT p_batch_id, 'doctors', d.id, 'virtual_consultation_price', d.virtual_consultation_price,
               fn_round_price(d.virtual_consultation_price * v_factor, p_step),
               p_percent, p_step, p_inflation_source, p_inflation_period, p_user_id
          FROM doctors d WHERE d.virtual_consultation_price > 0;

        UPDATE doctors d
          JOIN price_changes pc
            ON pc.batch_id = p_batch_id
           AND pc.scope = 'doctors'
           AND pc.target_id = d.id
           AND pc.field = 'consultation_price'
           SET d.consultation_price = pc.new_value;

        UPDATE doctors d
          JOIN price_changes pc
            ON pc.batch_id = p_batch_id
           AND pc.scope = 'doctors'
           AND pc.target_id = d.id
           AND pc.field = 'prescription_price'
           SET d.prescription_price = pc.new_value;

        UPDATE doctors d
          JOIN price_changes pc
            ON pc.batch_id = p_batch_id
           AND pc.scope = 'doctors'
           AND pc.target_id = d.id
           AND pc.field = 'medical_license_price'
           SET d.medical_license_price = pc.new_value;

        UPDATE doctors d
          JOIN price_changes pc
            ON pc.batch_id = p_batch_id
           AND pc.scope = 'doctors'
           AND pc.target_id = d.id
           AND pc.field = 'certificate_price'
           SET d.certificate_price = pc.new_value;

        UPDATE doctors d
          JOIN price_changes pc
            ON pc.batch_id = p_batch_id
           AND pc.scope = 'doctors'
           AND pc.target_id = d.id
           AND pc.field = 'virtual_consultation_price'
           SET d.virtual_consultation_price = pc.new_value;
    END IF;

    IF p_scope_institutions = 1 THEN
        INSERT INTO price_changes (
            batch_id, scope, target_id, field, old_value, new_value,
            percent, rounding_step, inflation_source, inflation_period, user_id
        )
        SELECT p_batch_id, 'institutions', i.id, 'base_price', i.base_price,
               fn_round_price(i.base_price * v_factor, p_step),
               p_percent, p_step, p_inflation_source, p_inflation_period, p_user_id
          FROM institutions i WHERE i.base_price > 0;

        UPDATE institutions i
          JOIN price_changes pc
            ON pc.batch_id = p_batch_id
           AND pc.scope = 'institutions'
           AND pc.target_id = i.id
           AND pc.field = 'base_price'
           SET i.base_price = pc.new_value;
    END IF;

    COMMIT;
END
`;

async function runMigration() {
    await dbReady;
    let conn;
    try {
        conn = await pool.getConnection();

        console.log('Ensuring table price_changes...');
        await conn.query(CREATE_TABLE);

        console.log('Recreating function fn_round_price...');
        await conn.query('DROP FUNCTION IF EXISTS fn_round_price');
        await conn.query(CREATE_FUNCTION);

        console.log('Recreating procedure proc_apply_price_increase...');
        await conn.query('DROP PROCEDURE IF EXISTS proc_apply_price_increase');
        await conn.query(CREATE_PROCEDURE);

        console.log('Migration executed successfully.');
    } catch (err) {
        console.error('Migration failed:', err.message);
        process.exitCode = 1;
    } finally {
        if (conn) conn.release();
        try {
            await pool.end();
        } catch {
            // El pool ya puede estar cerrado; el resultado ya está definido.
        }
        process.exit(process.exitCode || 0);
    }
}

runMigration();
