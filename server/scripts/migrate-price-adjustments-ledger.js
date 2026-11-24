/**
 * Idempotent migration: price adjustment dual ledger (#price-adjustments).
 *
 * Creates the four ledger tables, adds optional compatibility columns to
 * price_changes, and backfills historical data from price_changes.
 * Existing installations can run this script safely multiple times.
 *
 * Usage: node server/scripts/migrate-price-adjustments-ledger.js
 *
 * Requirements:
 * - CREATE TABLE / ALTER TABLE privileges on the target database.
 * - Routine replacement is intentionally NOT included and requires explicit
 *   approval per docs/specs/mysql-migration-design.md section 7.
 *
 * This script does NOT modify doctors, institutions, patients, transactions,
 * appointments, or price_changes rows. It only adds schema objects and inserts
 * ledger/period rows derived from existing price_changes history.
 */

// DB dependencies are loaded lazily inside runMigration() so tests can import
// exported constants without creating a database connection.

const PRICE_ADJUSTMENT_PERIODS_DDL = `
CREATE TABLE IF NOT EXISTS price_adjustment_periods (
  period CHAR(7) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  year SMALLINT NOT NULL,
  quarter TINYINT NOT NULL,
  inflation_factor DECIMAL(10,4) NOT NULL,
  effective_factor DECIMAL(10,4) NOT NULL,
  PRIMARY KEY (period),
  KEY idx_year (year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const PRICE_ADJUSTMENT_LEDGER_DDL = `
CREATE TABLE IF NOT EXISTS price_adjustment_ledger (
  id BIGINT NOT NULL AUTO_INCREMENT,
  batch_id CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  period CHAR(7) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  scope ENUM('doctors','institutions') NOT NULL,
  target_id INT NOT NULL,
  field ENUM('consultation_price','prescription_price','medical_license_price','certificate_price','virtual_consultation_price','base_price') NOT NULL,
  base_price DECIMAL(12,2) NOT NULL,
  inflation_factor DECIMAL(10,4) NOT NULL,
  effective_factor DECIMAL(10,4) NOT NULL,
  applied_factor DECIMAL(10,4) NOT NULL,
  suggested_price DECIMAL(12,2) NOT NULL,
  applied_price DECIMAL(12,2) NOT NULL,
  delta DECIMAL(12,2) NOT NULL,
  delta_pct DECIMAL(6,3) NOT NULL,
  rounding_step INT NOT NULL,
  adjustment_reason VARCHAR(255) NOT NULL,
  source ENUM('auto','manual') NOT NULL,
  status ENUM('accepted','accepted_with_adjustment') NOT NULL,
  user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_ledger_batch_target_field (batch_id, scope, target_id, field),
  KEY idx_ledger_period (period),
  KEY idx_ledger_period_target (period, scope, target_id, field),
  KEY idx_ledger_target (scope, target_id, field),
  KEY idx_ledger_batch (batch_id),
  CONSTRAINT fk_ledger_period FOREIGN KEY (period) REFERENCES price_adjustment_periods (period)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const PRICE_CLOSING_SUMMARIES_DDL = `
CREATE TABLE IF NOT EXISTS price_closing_summaries (
  year SMALLINT NOT NULL,
  inflation_yoy DECIMAL(10,4) NOT NULL,
  applied_cumulative DECIMAL(10,4) NOT NULL,
  margin DECIMAL(10,4) NOT NULL,
  verdict ENUM('cheaper','expensive','aligned') NOT NULL,
  PRIMARY KEY (year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const PRICE_VARIATION_NOTICES_DDL = `
CREATE TABLE IF NOT EXISTS price_variation_notices (
  id BIGINT NOT NULL AUTO_INCREMENT,
  appointment_id INT NOT NULL,
  booking_reference VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  quoted_price DECIMAL(12,2) NOT NULL,
  current_price DECIMAL(12,2) NOT NULL,
  delta DECIMAL(12,2) NOT NULL,
  days_before TINYINT NOT NULL,
  notified_at DATETIME NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_notice_appointment_quoted (appointment_id, quoted_price),
  KEY idx_notice_window (days_before, notified_at),
  CONSTRAINT fk_notice_appointment FOREIGN KEY (appointment_id) REFERENCES appointments (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const TABLE_DDL = {
    price_adjustment_periods: PRICE_ADJUSTMENT_PERIODS_DDL,
    price_adjustment_ledger: PRICE_ADJUSTMENT_LEDGER_DDL,
    price_closing_summaries: PRICE_CLOSING_SUMMARIES_DDL,
    price_variation_notices: PRICE_VARIATION_NOTICES_DDL
};

const PRICE_CHANGES_COLUMNS = [
    {
        name: 'source',
        definition: "ENUM('auto','manual') NULL",
        after: 'inflation_source'
    },
    {
        name: 'adjustment_reason',
        definition: 'VARCHAR(255) NULL',
        after: 'source'
    },
    {
        name: 'status',
        definition: "ENUM('accepted','accepted_with_adjustment') NULL",
        after: 'adjustment_reason'
    }
];

const INDEX_SPECS = [
    { table: 'price_adjustment_periods', index: 'idx_year', columns: ['year'] },
    { table: 'price_adjustment_ledger', index: 'uk_ledger_batch_target_field', columns: ['batch_id', 'scope', 'target_id', 'field'] },
    { table: 'price_adjustment_ledger', index: 'idx_ledger_period', columns: ['period'] },
    { table: 'price_adjustment_ledger', index: 'idx_ledger_period_target', columns: ['period', 'scope', 'target_id', 'field'] },
    { table: 'price_adjustment_ledger', index: 'idx_ledger_target', columns: ['scope', 'target_id', 'field'] },
    { table: 'price_adjustment_ledger', index: 'idx_ledger_batch', columns: ['batch_id'] },
    { table: 'price_variation_notices', index: 'uk_notice_appointment_quoted', columns: ['appointment_id', 'quoted_price'] },
    { table: 'price_variation_notices', index: 'idx_notice_window', columns: ['days_before', 'notified_at'] }
];

const BACKFILL_PERIODS_SQL = `
INSERT INTO price_adjustment_periods (period, year, quarter, inflation_factor, effective_factor)
SELECT
    p.period,
    CAST(SUBSTRING(p.period, 1, 4) AS UNSIGNED) AS year,
    CAST(SUBSTRING(p.period, 7, 1) AS UNSIGNED) AS quarter,
    p.inflation_factor,
    p.effective_factor
FROM (
    SELECT
        pc.inflation_period COLLATE utf8mb4_unicode_ci AS period,
        MIN(1 + (pc.percent / 100)) AS inflation_factor,
        MIN(1 + (pc.percent / 100)) AS effective_factor
    FROM price_changes pc
    WHERE pc.inflation_period IS NOT NULL
      AND pc.inflation_period REGEXP '^[0-9]{4}-Q[1-4]$'
      AND pc.percent IS NOT NULL
      AND pc.rounding_step IS NOT NULL
    GROUP BY pc.inflation_period COLLATE utf8mb4_unicode_ci
) p
WHERE NOT EXISTS (
    SELECT 1
    FROM price_adjustment_periods pap
    WHERE pap.period = p.period
)
`;

const BACKFILL_LEDGER_SQL = `
INSERT INTO price_adjustment_ledger (
    batch_id,
    period,
    scope,
    target_id,
    field,
    base_price,
    inflation_factor,
    effective_factor,
    applied_factor,
    suggested_price,
    applied_price,
    delta,
    delta_pct,
    rounding_step,
    adjustment_reason,
    source,
    status,
    user_id,
    created_at
)
SELECT
    pc.batch_id,
    pc.inflation_period COLLATE utf8mb4_unicode_ci AS period,
    pc.scope,
    pc.target_id,
    pc.field,
    pc.old_value AS base_price,
    (1 + (pc.percent / 100)) AS inflation_factor,
    (fn_round_price(pc.old_value * (1 + (pc.percent / 100)), pc.rounding_step) / NULLIF(pc.old_value, 0)) AS effective_factor,
    (pc.new_value / NULLIF(pc.old_value, 0)) AS applied_factor,
    fn_round_price(pc.old_value * (1 + (pc.percent / 100)), pc.rounding_step) AS suggested_price,
    pc.new_value AS applied_price,
    (pc.new_value - fn_round_price(pc.old_value * (1 + (pc.percent / 100)), pc.rounding_step)) AS delta,
    (100 * (pc.new_value - fn_round_price(pc.old_value * (1 + (pc.percent / 100)), pc.rounding_step))
        / NULLIF(fn_round_price(pc.old_value * (1 + (pc.percent / 100)), pc.rounding_step), 0)) AS delta_pct,
    pc.rounding_step,
    'historical backfill' AS adjustment_reason,
    CASE
        WHEN pc.inflation_source IS NOT NULL
         AND TRIM(pc.inflation_source) <> ''
         AND LOWER(TRIM(pc.inflation_source)) <> 'manual'
        THEN 'auto'
        ELSE 'manual'
    END AS source,
    CASE
        WHEN (pc.new_value - fn_round_price(pc.old_value * (1 + (pc.percent / 100)), pc.rounding_step)) = 0 THEN 'accepted'
        ELSE 'accepted_with_adjustment'
    END AS status,
    pc.user_id,
    pc.changed_at
FROM price_changes pc
WHERE pc.percent IS NOT NULL
  AND pc.rounding_step IS NOT NULL
  AND pc.inflation_period IS NOT NULL
  AND pc.inflation_period REGEXP '^[0-9]{4}-Q[1-4]$'
  AND NOT EXISTS (
      SELECT 1
      FROM price_adjustment_ledger pal
      WHERE pal.batch_id = pc.batch_id
        AND pal.scope = pc.scope
        AND pal.target_id = pc.target_id
        AND pal.field = pc.field
  )
`;

const BACKFILL_SQL = {
    periods: BACKFILL_PERIODS_SQL,
    ledger: BACKFILL_LEDGER_SQL
};

async function tableExists(conn, tableName) {
    const rows = await conn.query(
        `SELECT COUNT(*) AS count
         FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = ?`,
        [tableName]
    );
    return Number(rows[0].count) > 0;
}

async function columnExists(conn, tableName, columnName) {
    const rows = await conn.query(
        `SELECT COUNT(*) AS count
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = ?
           AND COLUMN_NAME = ?`,
        [tableName, columnName]
    );
    return Number(rows[0].count) > 0;
}

async function indexExists(conn, tableName, indexName) {
    const rows = await conn.query(
        `SELECT COUNT(*) AS count
         FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = ?
           AND INDEX_NAME = ?`,
        [tableName, indexName]
    );
    return Number(rows[0].count) > 0;
}

async function ensureTables(conn) {
    for (const [tableName, ddl] of Object.entries(TABLE_DDL)) {
        const exists = await tableExists(conn, tableName);
        if (exists) {
            console.log(`Table '${tableName}' already exists.`);
            continue;
        }
        console.log(`Creating table '${tableName}'...`);
        await conn.query(ddl);
        console.log(`Created table '${tableName}'.`);
    }
}

async function ensurePriceChangesColumns(conn) {
    for (const column of PRICE_CHANGES_COLUMNS) {
        const exists = await columnExists(conn, 'price_changes', column.name);
        if (exists) {
            console.log(`Column 'price_changes.${column.name}' already exists.`);
            continue;
        }

        console.log(`Adding column 'price_changes.${column.name}' AFTER '${column.after}'...`);
        await conn.query(
            `ALTER TABLE price_changes ADD COLUMN ${column.name} ${column.definition} AFTER ${column.after}`
        );
        console.log(`Added column 'price_changes.${column.name}'.`);
    }
}

async function ensureIndexes(conn) {
    for (const spec of INDEX_SPECS) {
        const exists = await indexExists(conn, spec.table, spec.index);
        if (exists) {
            console.log(`Index '${spec.table}.${spec.index}' already exists.`);
            continue;
        }

        // CREATE TABLE IF NOT EXISTS does not repair missing indexes on pre-existing tables.
        console.log(`Creating missing index '${spec.table}.${spec.index}'...`);
        const columnsSql = spec.columns.map((column) => `\`${column}\``).join(', ');
        const uniqueSql = spec.index.startsWith('uk_') ? 'UNIQUE ' : '';
        await conn.query(
            `CREATE ${uniqueSql}INDEX \`${spec.index}\` ON \`${spec.table}\` (${columnsSql})`
        );
        console.log(`Created index '${spec.table}.${spec.index}'.`);
    }
}

async function backfillPeriods(conn) {
    console.log('Backfilling price_adjustment_periods from price_changes...');
    const result = await conn.query(BACKFILL_PERIODS_SQL);
    console.log(`Backfilled periods: ${result.affectedRows || 0} row(s) inserted.`);
}

async function backfillLedger(conn) {
    console.log('Backfilling price_adjustment_ledger from price_changes...');
    // Assumption: historical inflation_source values other than NULL/empty/'manual'
    // are treated as automatic sources. This preserves intent without inventing
    // batch IDs or mutating existing price_changes rows.
    // Assumption: adjustment_reason is set to 'historical backfill' because the
    // legacy schema did not store per-row reasons.
    const result = await conn.query(BACKFILL_LEDGER_SQL);
    console.log(`Backfilled ledger: ${result.affectedRows || 0} row(s) inserted.`);
}

async function runMigration() {
    const { pool, dbReady } = require('../db');
    await dbReady;
    const conn = await pool.getConnection();
    try {
        console.log('Starting price adjustments ledger migration...');
        await ensureTables(conn);
        await ensurePriceChangesColumns(conn);
        await ensureIndexes(conn);
        await backfillPeriods(conn);
        await backfillLedger(conn);
        console.log('Price adjustments ledger migration completed successfully.');
        console.log('Routine replacement is intentionally NOT included. Review design section 7 before any DROP/CREATE routine.');
    } catch (err) {
        console.error('Price adjustments ledger migration failed:', err);
        process.exitCode = 1;
    } finally {
        conn.release();
        try {
            await pool.end();
        } catch (closeErr) {
            console.error('Failed to close DB pool cleanly:', closeErr);
            process.exitCode = 1;
        }
    }
}

if (require.main === module) {
    runMigration();
}

module.exports = {
    TABLE_DDL,
    PRICE_CHANGES_COLUMNS,
    INDEX_SPECS,
    BACKFILL_SQL,
    BACKFILL_PERIODS_SQL,
    BACKFILL_LEDGER_SQL,
    PRICE_ADJUSTMENT_PERIODS_DDL,
    PRICE_ADJUSTMENT_LEDGER_DDL,
    PRICE_CLOSING_SUMMARIES_DDL,
    PRICE_VARIATION_NOTICES_DDL,
    runMigration,
    tableExists,
    columnExists,
    indexExists,
    ensureTables,
    ensurePriceChangesColumns,
    ensureIndexes,
    backfillPeriods,
    backfillLedger
};
