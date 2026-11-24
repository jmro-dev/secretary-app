/**
 * Test de integración del ajuste de aranceles (#711).
 *
 * Requiere una base DESCARTABLE ya migrada. Se saltea salvo que se configure:
 *
 *   PRICE_ADJ_TEST_DB=test_clinical DB_USER=root DB_PASSWORD=... npx jest price-adjustments.db
 *
 * El test restaura los precios originales al terminar, incluso si falla.
 */

const FIELDS = [
    'consultation_price',
    'prescription_price',
    'medical_license_price',
    'certificate_price',
    'virtual_consultation_price'
];

const TEST_DB = process.env.PRICE_ADJ_TEST_DB;
const describeDb = TEST_DB ? describe : describe.skip;

function expectedPrice(oldValue, percent, step) {
    const raw = Number(oldValue) * (1 + percent / 100);
    return Math.ceil(raw / step) * step;
}

describeDb('proc_apply_price_increase (integración contra MariaDB)', () => {
    let pool;
    let doctorsBefore;
    let institutionsBefore;
    const batchId = `jest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const overrideBatchId = `${batchId}-manual`;

    beforeAll(async () => {
        // mysql2 es CJS: evita el import dinámico ESM de mariadb, que jest no
        // puede resolver cuando corre en workers.
        const mysql = require('mysql2/promise');
        pool = await mysql.createPool({
            host: process.env.DB_HOST || '127.0.0.1',
            port: Number(process.env.DB_PORT || 3306),
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD,
            database: TEST_DB,
            connectionLimit: 2
        });
        [doctorsBefore] = await pool.query(`SELECT id, ${FIELDS.join(', ')} FROM doctors`);
        [institutionsBefore] = await pool.query('SELECT id, base_price FROM institutions');
    });

    afterAll(async () => {
        if (!pool) return;
        try {
            for (const doctor of doctorsBefore) {
                await pool.query(
                    `UPDATE doctors SET ${FIELDS.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`,
                    [...FIELDS.map((f) => doctor[f]), doctor.id]
                );
            }
            for (const inst of institutionsBefore) {
                await pool.query('UPDATE institutions SET base_price = ? WHERE id = ?', [inst.base_price, inst.id]);
            }
            await pool.query('DELETE FROM price_changes WHERE batch_id IN (?, ?)', [batchId, overrideBatchId]);
        } finally {
            await pool.end();
        }
    });

    it('redondea al múltiplo de 500 y audita cada celda modificada', async () => {
        const percent = 12.5;
        const step = 500;

        await pool.query('CALL proc_apply_price_increase(?, ?, ?, 1, 1, ?, ?, ?, ?)', [
            batchId, percent, step, 'INDEC', '2026-10', 1, null
        ]);

        const [doctorsAfter] = await pool.query(`SELECT id, ${FIELDS.join(', ')} FROM doctors`);
        const byId = new Map(doctorsAfter.map((d) => [Number(d.id), d]));
        const expectedCells = [];

        for (const before of doctorsBefore) {
            const after = byId.get(Number(before.id));
            for (const field of FIELDS) {
                const oldValue = Number(before[field]);
                if (oldValue <= 0) continue;
                const expected = expectedPrice(oldValue, percent, step);
                expect(Number(after[field])).toBe(expected);
                expect(Number(after[field]) % step).toBe(0);
                expectedCells.push({ id: Number(before.id), field, oldValue, expected });
            }
        }

        const [institutionsAfter] = await pool.query('SELECT id, base_price FROM institutions');
        const instById = new Map(institutionsAfter.map((i) => [Number(i.id), i]));
        for (const before of institutionsBefore) {
            const oldValue = Number(before.base_price);
            if (oldValue <= 0) continue;
            const expected = expectedPrice(oldValue, percent, step);
            expect(Number(instById.get(Number(before.id)).base_price)).toBe(expected);
        }

        const [audit] = await pool.query(
            'SELECT scope, target_id, field, old_value, new_value FROM price_changes WHERE batch_id = ?',
            [batchId]
        );
        expect(audit).toHaveLength(expectedCells.length + (institutionsBefore.filter((i) => Number(i.base_price) > 0).length));

        for (const cell of expectedCells) {
            const row = audit.find(
                (r) => r.scope === 'doctors' && Number(r.target_id) === cell.id && r.field === cell.field
            );
            expect(row).toBeDefined();
            expect(Number(row.old_value)).toBe(cell.oldValue);
            expect(Number(row.new_value)).toBe(cell.expected);
        }
    });

    it('aplica el override manual dentro de la misma transacción del procedimiento', async () => {
        const overridePrice = 123456;

        await pool.query('CALL proc_apply_price_increase(?, ?, ?, 1, 1, ?, ?, ?, ?)', [
            overrideBatchId, 0, 500, 'manual', '2026-Q1', 1, overridePrice
        ]);

        const [audit] = await pool.query(
            `SELECT scope, target_id, field, old_value, new_value, status
               FROM price_changes WHERE batch_id = ? ORDER BY id ASC`,
            [overrideBatchId]
        );
        expect(audit.length).toBeGreaterThan(0);
        expect(Number(audit[0].new_value)).toBe(overridePrice);
        expect(audit[0].status).toBe('accepted_with_adjustment');

        const first = audit[0];
        const [liveRows] = first.scope === 'doctors'
            ? await pool.query(`SELECT ${first.field} AS price FROM doctors WHERE id = ?`, [first.target_id])
            : await pool.query('SELECT base_price AS price FROM institutions WHERE id = ?', [first.target_id]);
        expect(Number(liveRows[0].price)).toBe(overridePrice);
    });

    it('rechaza reaplicar el mismo batch_id', async () => {
        await expect(
            pool.query('CALL proc_apply_price_increase(?, 5, 500, 1, 1, NULL, NULL, NULL, NULL)', [batchId])
        ).rejects.toThrow(/batch_id already applied/);
    });

    it('rechaza un porcentaje que anularía el precio', async () => {
        await expect(
            pool.query('CALL proc_apply_price_increase(?, -100, 500, 1, 1, NULL, NULL, NULL, NULL)', ['jest-guard'])
        ).rejects.toThrow(/percent must be greater than -100/);
    });
});
