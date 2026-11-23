const axios = require('axios');
const crypto = require('crypto');
const { pool } = require('../../db');

const INDEC_URL = 'https://apis.datos.gob.ar/series/api/series/?ids=148.3_INIVELNAL_DICI_M_26&limit=36&sort=desc';
const ARGENTINADATOS_URL = 'https://api.argentinadatos.com/v1/finanzas/indices/inflacion';

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const TIMEOUT_MS = 5000; // 5 seconds timeout

// In-memory cache for inflation queries: key -> { timestamp, data }
const inflationCache = new Map();

/**
 * Calculates months difference between two Date objects or YYYY-MM strings.
 */
function calculateMonthsDifference(fromDate, toDate) {
    const d1 = new Date(fromDate);
    const d2 = new Date(toDate);
    const yearsDiff = d2.getFullYear() - d1.getFullYear();
    const monthsDiff = d2.getMonth() - d1.getMonth();
    return Math.max(1, yearsDiff * 12 + monthsDiff);
}

/**
 * Normalizes scope parameter into boolean flags or array.
 */
function normalizeScope(scope) {
    if (Array.isArray(scope)) {
        return {
            doctors: scope.includes('doctors'),
            institutions: scope.includes('institutions')
        };
    }
    if (typeof scope === 'string') {
        const parts = scope.split(',').map(s => s.trim().toLowerCase());
        return {
            doctors: parts.includes('doctors'),
            institutions: parts.includes('institutions')
        };
    }
    return { doctors: true, institutions: true };
}

/**
 * Commercial rounding helper matching MySQL fn_round_price(val, step):
 * CEIL(val / step) * step
 */
function roundPrice(value, step) {
    if (!step || step <= 0) return Number(value);
    return Math.ceil(value / step) * step;
}

class PriceAdjustmentService {
    /**
     * S4 & S5: Fetch inflation rate from INDEC primary API with fallback to argentinadatos.
     * Caches successful responses for 6 hours.
     * If both fail, returns { available: false, reason } gracefully without throwing.
     */
    async getInflation(since) {
        const cacheKey = since || 'default';
        const cached = inflationCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
            return cached.data;
        }

        let result = null;

        // 1. Try Primary: INDEC API
        try {
            const resp = await axios.get(INDEC_URL, { timeout: TIMEOUT_MS });
            const data = resp.data?.data;
            if (Array.isArray(data) && data.length >= 2) {
                // data is sorted desc: [[ "2026-10-01", 12785.9321 ], [ "2026-09-01", ... ]]
                const latestEntry = data[0];
                const latestDate = latestEntry[0];
                const latestIpc = Number(latestEntry[1]);

                let targetEntry;
                if (since) {
                    const sinceDateStr = since.length === 7 ? `${since}-01` : since;
                    // Find closest entry with date <= sinceDateStr, or oldest available
                    targetEntry = data.find(row => row[0] <= sinceDateStr) || data[data.length - 1];
                } else {
                    // Default to 3 months prior (quarterly cadence)
                    targetEntry = data[3] || data[data.length - 1];
                }

                const baseDate = targetEntry[0];
                const baseIpc = Number(targetEntry[1]);

                if (baseIpc > 0) {
                    // S4: Ratio of indices (IPC_hoy / IPC_since - 1) * 100
                    const ratio = ((latestIpc / baseIpc) - 1) * 100;
                    const percent = Number(ratio.toFixed(4));
                    const months = calculateMonthsDifference(baseDate, latestDate);

                    result = {
                        available: true,
                        percent,
                        from: baseDate.substring(0, 7),
                        to: latestDate.substring(0, 7),
                        source: 'INDEC',
                        asOf: latestDate,
                        months
                    };
                }
            }
        } catch (indecErr) {
            console.warn('[PriceAdjustmentService] Primary INDEC source failed, trying fallback:', indecErr.message);
        }

        // 2. Try Fallback: argentinadatos
        if (!result) {
            try {
                const resp = await axios.get(ARGENTINADATOS_URL, { timeout: TIMEOUT_MS });
                const list = resp.data;
                if (Array.isArray(list) && list.length > 0) {
                    // list is sorted asc: [{ fecha: "YYYY-MM-DD", valor: 2.2 }]
                    const latestItem = list[list.length - 1];
                    const latestDate = latestItem.fecha;

                    let filteredMonths;
                    if (since) {
                        const sinceMonth = since.substring(0, 7);
                        filteredMonths = list.filter(item => item.fecha.substring(0, 7) >= sinceMonth);
                    } else {
                        filteredMonths = list.slice(-3); // Last 3 months
                    }

                    if (filteredMonths.length > 0) {
                        // Compound monthly inflation: factor = product(1 + valor/100)
                        let factor = 1.0;
                        for (const m of filteredMonths) {
                            const val = Number(m.valor) || 0;
                            factor *= (1 + (val / 100));
                        }
                        const percent = Number(((factor - 1) * 100).toFixed(4));
                        const baseDate = filteredMonths[0].fecha;

                        result = {
                            available: true,
                            percent,
                            from: baseDate.substring(0, 7),
                            to: latestDate.substring(0, 7),
                            source: 'argentinadatos',
                            asOf: latestDate,
                            months: filteredMonths.length
                        };
                    }
                }
            } catch (fallbackErr) {
                console.warn('[PriceAdjustmentService] Fallback argentinadatos failed:', fallbackErr.message);
            }
        }

        // 3. Both failed -> return available: false gracefully
        if (!result) {
            return {
                available: false,
                reason: 'No se pudo consultar el índice de inflación de INDEC ni del servicio alternativo.'
            };
        }

        // Store in cache
        inflationCache.set(cacheKey, { timestamp: Date.now(), data: result });
        return result;
    }

    /**
     * Clears internal inflation cache (useful for tests or refresh).
     */
    clearCache() {
        inflationCache.clear();
    }

    /**
     * Returns last price adjustment status from price_changes table.
     * Computes whether an adjustment is currently pending (cadence >= 90 days).
     */
    async getStatus() {
        const rows = await pool.query(`
            SELECT 
                MAX(changed_at) AS last_adjusted_at,
                (SELECT batch_id FROM price_changes ORDER BY changed_at DESC LIMIT 1) AS last_batch_id,
                COUNT(DISTINCT batch_id) AS total_batches,
                COUNT(*) AS total_records
            FROM price_changes;
        `);

        const row = rows[0] || {};
        const lastAdjustedAt = row.last_adjusted_at ? new Date(row.last_adjusted_at).toISOString() : null;
        let daysSinceLastAdjustment = null;
        let isAdjustmentPending = true;

        if (lastAdjustedAt) {
            const lastTime = new Date(lastAdjustedAt).getTime();
            daysSinceLastAdjustment = Math.floor((Date.now() - lastTime) / (1000 * 60 * 60 * 24));
            isAdjustmentPending = daysSinceLastAdjustment >= 90;
        }

        return {
            lastAdjustedAt,
            lastBatchId: row.last_batch_id || null,
            daysSinceLastAdjustment,
            isAdjustmentPending,
            recommendedCadenceDays: 90,
            totalBatches: Number(row.total_batches || 0),
            totalRecords: Number(row.total_records || 0)
        };
    }

    /**
     * S6: Read-only preview of proposed price increases.
     * Computes oldValue -> newValue with commercial rounding to step.
     */
    async previewIncrease({ percent, step = 500, scope = ['doctors', 'institutions'] }) {
        const numPercent = Number(percent);
        if (isNaN(numPercent) || numPercent <= -100) {
            throw new Error('percent must be greater than -100');
        }

        const roundingStep = Number(step) > 0 ? Number(step) : 500;
        const scopeFlags = normalizeScope(scope);
        const factor = 1 + (numPercent / 100);
        const items = [];

        // Preview doctors
        if (scopeFlags.doctors) {
            const doctors = await pool.query(`
                SELECT id, name, consultation_price, prescription_price,
                       medical_license_price, certificate_price, virtual_consultation_price
                  FROM doctors;
            `);

            const doctorFields = [
                { field: 'consultation_price', label: 'Consulta' },
                { field: 'prescription_price', label: 'Receta' },
                { field: 'medical_license_price', label: 'Licencia Médica' },
                { field: 'certificate_price', label: 'Certificado' },
                { field: 'virtual_consultation_price', label: 'Consulta Virtual' }
            ];

            for (const doc of doctors) {
                for (const { field, label } of doctorFields) {
                    const oldValue = Number(doc[field] || 0);
                    if (oldValue > 0) {
                        const newValue = roundPrice(oldValue * factor, roundingStep);
                        items.push({
                            scope: 'doctors',
                            targetId: doc.id,
                            targetName: doc.name,
                            field,
                            fieldLabel: label,
                            oldValue,
                            newValue,
                            difference: newValue - oldValue
                        });
                    }
                }
            }
        }

        // Preview institutions
        if (scopeFlags.institutions) {
            const institutions = await pool.query(`
                SELECT id, name, base_price
                  FROM institutions;
            `);

            for (const inst of institutions) {
                const oldValue = Number(inst.base_price || 0);
                if (oldValue > 0) {
                    const newValue = roundPrice(oldValue * factor, roundingStep);
                    items.push({
                        scope: 'institutions',
                        targetId: inst.id,
                        targetName: inst.name,
                        field: 'base_price',
                        fieldLabel: 'Arancel Base',
                        oldValue,
                        newValue,
                        difference: newValue - oldValue
                    });
                }
            }
        }

        return {
            percent: numPercent,
            step: roundingStep,
            count: items.length,
            items
        };
    }

    /**
     * S7: Applies price increase transactionally via stored procedure proc_apply_price_increase.
     * Returns batchId and affected rows recorded in price_changes.
     */
    async applyIncrease({ percent, step = 500, scope = ['doctors', 'institutions'], batchId, inflationSource, inflationPeriod, userId }) {
        const numPercent = Number(percent);
        if (isNaN(numPercent) || numPercent <= -100) {
            throw new Error('percent must be greater than -100');
        }

        const roundingStep = Number(step) > 0 ? Number(step) : 500;
        const finalBatchId = batchId || crypto.randomUUID();
        const scopeFlags = normalizeScope(scope);

        const scopeDoctors = scopeFlags.doctors ? 1 : 0;
        const scopeInstitutions = scopeFlags.institutions ? 1 : 0;

        if (scopeDoctors === 0 && scopeInstitutions === 0) {
            throw new Error('At least one scope (doctors or institutions) must be selected');
        }

        // Call stored procedure
        await pool.query(
            'CALL proc_apply_price_increase(?, ?, ?, ?, ?, ?, ?, ?)',
            [
                finalBatchId,
                numPercent,
                roundingStep,
                scopeDoctors,
                scopeInstitutions,
                inflationSource || 'manual',
                inflationPeriod || null,
                userId || null
            ]
        );

        // Fetch affected count
        const countRows = await pool.query(
            'SELECT COUNT(*) AS affectedRows FROM price_changes WHERE batch_id = ?',
            [finalBatchId]
        );

        const affectedRows = Number(countRows[0]?.affectedRows || 0);

        return {
            success: true,
            batchId: finalBatchId,
            percent: numPercent,
            step: roundingStep,
            affectedRows,
            appliedAt: new Date().toISOString()
        };
    }
}

module.exports = new PriceAdjustmentService();
