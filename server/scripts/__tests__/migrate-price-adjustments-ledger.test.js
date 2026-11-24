/**
 * Static verification for the price adjustments ledger migration.
 * Imports exported constants/helpers only; no DB connection is created.
 */

const {
    TABLE_DDL,
    PRICE_CHANGES_COLUMNS,
    BACKFILL_SQL,
    INDEX_SPECS
} = require('../migrate-price-adjustments-ledger');

const ALL_DDL = Object.values(TABLE_DDL).join('\n');
const ALL_SQL = [...Object.values(TABLE_DDL), ...Object.values(BACKFILL_SQL)].join('\n');

describe('migrate-price-adjustments-ledger', () => {
    it('defines the four new tables', () => {
        expect(TABLE_DDL).toHaveProperty('price_adjustment_periods');
        expect(TABLE_DDL).toHaveProperty('price_adjustment_ledger');
        expect(TABLE_DDL).toHaveProperty('price_closing_summaries');
        expect(TABLE_DDL).toHaveProperty('price_variation_notices');
        expect(ALL_DDL).toContain('CREATE TABLE IF NOT EXISTS price_adjustment_periods');
        expect(ALL_DDL).toContain('CREATE TABLE IF NOT EXISTS price_adjustment_ledger');
        expect(ALL_DDL).toContain('CREATE TABLE IF NOT EXISTS price_closing_summaries');
        expect(ALL_DDL).toContain('CREATE TABLE IF NOT EXISTS price_variation_notices');
    });

    it('contains required ledger columns and constraints', () => {
        expect(ALL_DDL).toContain('inflation_factor DECIMAL(10,4) NOT NULL');
        expect(ALL_DDL).toContain('effective_factor DECIMAL(10,4) NOT NULL');
        expect(ALL_DDL).toContain('applied_factor DECIMAL(10,4) NOT NULL');
        expect(ALL_DDL).toContain('suggested_price DECIMAL(12,2) NOT NULL');
        expect(ALL_DDL).toContain('applied_price DECIMAL(12,2) NOT NULL');
        expect(ALL_DDL).toContain('delta DECIMAL(12,2) NOT NULL');
        expect(ALL_DDL).toContain('delta_pct DECIMAL(6,3) NOT NULL');
        expect(ALL_DDL).toContain('adjustment_reason VARCHAR(255) NOT NULL');
        expect(ALL_DDL).toContain("source ENUM('auto','manual') NOT NULL");
        expect(ALL_DDL).toContain("status ENUM('accepted','accepted_with_adjustment') NOT NULL");
        expect(ALL_DDL).toContain('UNIQUE KEY uk_ledger_batch_target_field');
        expect(ALL_DDL).toContain('UNIQUE KEY uk_notice_appointment_quoted');
        expect(ALL_DDL).toContain('utf8mb4_unicode_ci');
    });

    it('defines the three optional price_changes columns', () => {
        const names = PRICE_CHANGES_COLUMNS.map((column) => column.name);
        expect(names).toEqual(['source', 'adjustment_reason', 'status']);
        expect(PRICE_CHANGES_COLUMNS[0]).toMatchObject({ after: 'inflation_source' });
        expect(PRICE_CHANGES_COLUMNS[1]).toMatchObject({ after: 'source' });
        expect(PRICE_CHANGES_COLUMNS[2]).toMatchObject({ after: 'adjustment_reason' });
    });

    it('does not contain destructive DDL or protected-table updates', () => {
        expect(ALL_SQL).not.toMatch(/DROP TABLE/i);
        expect(ALL_SQL).not.toMatch(/DROP DATABASE/i);
        expect(BACKFILL_SQL.ledger).not.toMatch(/UPDATE\s+doctors/i);
        expect(BACKFILL_SQL.ledger).not.toMatch(/UPDATE\s+institutions/i);
        expect(BACKFILL_SQL.ledger).not.toMatch(/UPDATE\s+patients/i);
        expect(BACKFILL_SQL.ledger).not.toMatch(/UPDATE\s+transactions/i);
        expect(BACKFILL_SQL.ledger).not.toMatch(/UPDATE\s+appointments/i);
        expect(BACKFILL_SQL.ledger).not.toMatch(/UPDATE\s+price_changes/i);
    });

    it('backfill uses guardrails from the design', () => {
        expect(BACKFILL_SQL.periods).toContain('WHERE NOT EXISTS');
        expect(BACKFILL_SQL.ledger).toContain('NOT EXISTS');
        expect(BACKFILL_SQL.ledger).toContain('pc.percent IS NOT NULL');
        expect(BACKFILL_SQL.ledger).toContain('pc.rounding_step IS NOT NULL');
        expect(BACKFILL_SQL.ledger).toContain("REGEXP '^[0-9]{4}-Q[1-4]$'");
        expect(BACKFILL_SQL.ledger).toContain('NULLIF(pc.old_value, 0)');
        expect(BACKFILL_SQL.ledger).toContain('NULLIF(fn_round_price');
        expect(BACKFILL_SQL.ledger).toContain("'historical backfill'");
        expect(BACKFILL_SQL.ledger).not.toContain('price_closing_summaries');
        expect(BACKFILL_SQL.ledger).not.toContain('price_variation_notices');
    });

    it('tracks index specs for pre-existing table checks', () => {
        expect(INDEX_SPECS.length).toBeGreaterThan(0);
        expect(INDEX_SPECS).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ table: 'price_adjustment_ledger', index: 'uk_ledger_batch_target_field' }),
                expect.objectContaining({ table: 'price_variation_notices', index: 'uk_notice_appointment_quoted' })
            ])
        );
    });
});
