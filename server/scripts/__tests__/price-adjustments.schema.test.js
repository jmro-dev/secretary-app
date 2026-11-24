/**
 * Garantiza que el dump de instalación nueva (server/01-schema.sql) y la
 * migración para bases existentes (migrate-price-adjustments.js) definan la
 * misma tabla y las mismas rutinas. Si una copia se edita sola, divergen en
 * producción sin que nadie lo note.
 */

const fs = require('fs');
const path = require('path');

const {
    CREATE_TABLE,
    CREATE_FUNCTION,
    CREATE_PROCEDURE
} = require('../migrate-price-adjustments');

const SCHEMA_PATH = path.join(__dirname, '..', '..', '01-schema.sql');

function normalize(sql) {
    return sql
        .replace(/`/g, '')
        .replace(/IF NOT EXISTS/gi, '')
        .replace(/DEFINER=[^\s]+@[^\s]+/gi, '')
        .replace(/--[^\n]*/g, '')
        .replace(/;;/g, '')
        .replace(/;/g, '')
        .replace(/\s*,\s*/g, ',')
        .replace(/\(\s*/g, '(')
        .replace(/\s*\)/g, ')')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

describe('price adjustments schema parity', () => {
    let schema;

    beforeAll(() => {
        schema = normalize(fs.readFileSync(SCHEMA_PATH, 'utf8'));
    });

    it('defines the same price_changes table in both sources', () => {
        expect(schema).toContain(normalize(CREATE_TABLE));
    });

    it('defines the same fn_round_price in both sources', () => {
        expect(schema).toContain(normalize(CREATE_FUNCTION));
    });

    it('defines the same proc_apply_price_increase in both sources', () => {
        expect(schema).toContain(normalize(CREATE_PROCEDURE));
    });

    it('keeps percent aligned with the DECIMAL(10,4) parameter', () => {
        expect(normalize(CREATE_TABLE)).toContain('percent decimal(10,4)');
        expect(normalize(CREATE_PROCEDURE)).toContain('p_percent decimal(10,4)');
    });
});
