const axios = require('axios');
const crypto = require('crypto');
const { pool } = require('../../db');

const INDEC_URL = 'https://apis.datos.gob.ar/series/api/series/?ids=148.3_INIVELNAL_DICI_M_26&limit=36&sort=desc';
const ARGENTINADATOS_URL = 'https://api.argentinadatos.com/v1/finanzas/indices/inflacion';

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const TIMEOUT_MS = 5000; // 5 seconds timeout
const PRICE_PERIOD_REGEX = /^[0-9]{4}-Q[1-4]$/;

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

function normalizePercent(percent) {
    const numPercent = Number(percent);
    if (Number.isNaN(numPercent) || numPercent <= -100) {
        throw new Error('percent must be greater than -100');
    }
    return numPercent;
}

function normalizeRoundingStep(step) {
    const numericStep = Number(step);
    return numericStep > 0 ? numericStep : 500;
}

function normalizeSource(source) {
    return source === 'manual' ? 'manual' : 'auto';
}

function computeFactorFromPercent(percent) {
    return 1 + (Number(percent) / 100);
}

function computeEffectiveFactor(suggestedPrice, basePrice) {
    const base = Number(basePrice);
    if (!base) return 0;
    return Number(suggestedPrice) / base;
}

function computeDeltaPct(delta, suggestedPrice) {
    const suggested = Number(suggestedPrice);
    if (!suggested) return 0;
    return (100 * Number(delta)) / suggested;
}

function resolveAdjustmentStatus(delta) {
    return Number(delta) === 0 ? 'accepted' : 'accepted_with_adjustment';
}

function computeMargin(appliedCumulative, inflationYoY) {
    return Number(appliedCumulative) - Number(inflationYoY);
}

function resolveVerdict(margin) {
    const numericMargin = Number(margin);
    if (numericMargin < 0) return 'cheaper';
    if (numericMargin > 0) return 'expensive';
    return 'aligned';
}

function defaultPeriodFromDate(date = new Date()) {
    const year = date.getUTCFullYear();
    const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
    return `${year}-Q${quarter}`;
}

function parsePricePeriod(period) {
    const match = typeof period === 'string' ? period.match(/^([0-9]{4})-Q([1-4])$/) : null;
    if (!match) return parsePricePeriod(defaultPeriodFromDate());
    return { year: Number(match[1]), quarter: Number(match[2]) };
}

class PriceAdjustmentService {
    /**
     * S4 & S5: Fetch inflation rate from INDEC primary API with fallback to argentinadatos.
     * Caches successful responses for 6 hours.
     * If both fail, returns { available: false, reason } gracefully without throwing.
     */
    async getInflation(since) {
        const requestedSince = Array.isArray(since) ? since[0] : since;
        const normalizedSince = typeof requestedSince === 'string' && requestedSince.trim()
            ? requestedSince.trim()
            : undefined;
        const cacheKey = normalizedSince || 'default';
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
                if (normalizedSince) {
                    const sinceDateStr = normalizedSince.length === 7
                        ? `${normalizedSince}-01`
                        : normalizedSince;
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
                    if (normalizedSince) {
                        const sinceMonth = normalizedSince.substring(0, 7);
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
     * Returns contract-shaped suggestion metadata and keeps legacy fields for current callers.
     */
    async previewIncrease({ percent, step = 500, scope = ['doctors', 'institutions'], period, basePrice } = {}) {
        const numPercent = normalizePercent(percent);
        const roundingStep = normalizeRoundingStep(step);
        const scopeFlags = normalizeScope(scope);
        const inflationFactor = computeFactorFromPercent(numPercent);
        const items = [];
        const selectedPeriod = typeof period === 'string' && PRICE_PERIOD_REGEX.test(period)
            ? period
            : defaultPeriodFromDate();

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
                        const newValue = roundPrice(oldValue * inflationFactor, roundingStep);
                        items.push({
                            scope: 'doctors',
                            targetId: doc.id,
                            targetName: doc.name,
                            field,
                            fieldLabel: label,
                            oldValue,
                            newValue,
                            difference: newValue - oldValue,
                            basePrice: oldValue,
                            inflationFactor,
                            effectiveFactor: computeEffectiveFactor(newValue, oldValue),
                            suggestedPrice: newValue,
                            roundingStep
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
                    const newValue = roundPrice(oldValue * inflationFactor, roundingStep);
                    items.push({
                        scope: 'institutions',
                        targetId: inst.id,
                        targetName: inst.name,
                        field: 'base_price',
                        fieldLabel: 'Arancel Base',
                        oldValue,
                        newValue,
                        difference: newValue - oldValue,
                        basePrice: oldValue,
                        inflationFactor,
                        effectiveFactor: computeEffectiveFactor(newValue, oldValue),
                        suggestedPrice: newValue,
                        roundingStep
                    });
                }
            }
        }

        const selectedBasePrice = basePrice !== undefined && basePrice !== null && !Number.isNaN(Number(basePrice))
            ? Number(basePrice)
            : Number(items[0]?.basePrice || 0);
        const suggestedPrice = roundPrice(selectedBasePrice * inflationFactor, roundingStep);

        return {
            period: selectedPeriod,
            basePrice: selectedBasePrice,
            inflationFactor,
            effectiveFactor: computeEffectiveFactor(suggestedPrice, selectedBasePrice),
            suggestedPrice,
            roundingStep,
            scope: Object.keys(scopeFlags).filter((key) => scopeFlags[key]),
            rows: items,
            // Legacy fields kept for existing consumers.
            percent: numPercent,
            step: roundingStep,
            count: items.length,
            items
        };
    }

    /**
     * S7: Applies price increase via stored procedure proc_apply_price_increase.
     * The procedure owns transaction/commit semantics and applies the manual override inside
     * the same transaction. After a successful CALL, ledger/notice writes are best-effort:
     * price_changes remains the atomic audit source, so we log warnings and keep the response.
     */
    async applyIncrease({
        percent,
        step = 500,
        scope = ['doctors', 'institutions'],
        batchId,
        inflationSource,
        inflationPeriod,
        userId,
        period,
        basePrice,
        suggestedPrice,
        appliedPrice,
        roundingStep,
        adjustmentReason,
        source
    } = {}) {
        const numPercent = normalizePercent(percent);
        const resolvedRoundingStep = normalizeRoundingStep(roundingStep !== undefined ? roundingStep : step);
        const finalBatchId = batchId || crypto.randomUUID();
        const scopeFlags = normalizeScope(scope);
        const scopeDoctors = scopeFlags.doctors ? 1 : 0;
        const scopeInstitutions = scopeFlags.institutions ? 1 : 0;

        if (scopeDoctors === 0 && scopeInstitutions === 0) {
            throw new Error('At least one scope (doctors or institutions) must be selected');
        }

        const resolvedPeriod = typeof period === 'string' && PRICE_PERIOD_REGEX.test(period)
            ? period
            : (typeof inflationPeriod === 'string' && PRICE_PERIOD_REGEX.test(inflationPeriod) ? inflationPeriod : defaultPeriodFromDate());
        const resolvedSource = normalizeSource(source || inflationSource);
        const resolvedReason = adjustmentReason || 'manual adjustment';
        const resolvedBasePrice = basePrice !== undefined && basePrice !== null && !Number.isNaN(Number(basePrice))
            ? Number(basePrice)
            : undefined;
        const resolvedSuggestedPrice = suggestedPrice !== undefined && suggestedPrice !== null && !Number.isNaN(Number(suggestedPrice))
            ? Number(suggestedPrice)
            : undefined;
        const resolvedAppliedPrice = appliedPrice !== undefined && appliedPrice !== null && !Number.isNaN(Number(appliedPrice))
            ? Number(appliedPrice)
            : undefined;
        const inflationFactor = computeFactorFromPercent(numPercent);

        await pool.query(
            'CALL proc_apply_price_increase(?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                finalBatchId,
                numPercent,
                resolvedRoundingStep,
                scopeDoctors,
                scopeInstitutions,
                inflationSource || source || 'manual',
                inflationPeriod || period || null,
                userId || null,
                resolvedAppliedPrice ?? null
            ]
        );

        const countRows = await pool.query(
            'SELECT COUNT(*) AS affectedRows FROM price_changes WHERE batch_id = ?',
            [finalBatchId]
        );
        const affectedRows = Number(countRows[0]?.affectedRows || 0);

        let ledgerRecorded = false;
        try {
            await this.recordLedgerEntries({
                batchId: finalBatchId,
                period: resolvedPeriod,
                basePrice: resolvedBasePrice,
                inflationFactor,
                suggestedPrice: resolvedSuggestedPrice,
                appliedPrice: resolvedAppliedPrice,
                roundingStep: resolvedRoundingStep,
                adjustmentReason: resolvedReason,
                source: resolvedSource,
                userId
            });
            ledgerRecorded = true;
        } catch (ledgerErr) {
            console.error('[PriceAdjustmentService] Ledger write failed after successful price change:', ledgerErr.message);
        }

        try {
            await this.refreshDuePriceNotices({ batchId: finalBatchId });
        } catch (noticeErr) {
            console.warn('[PriceAdjustmentService] Price variation notice refresh failed:', noticeErr.message);
        }

        const summarySuggested = resolvedSuggestedPrice !== undefined
            ? resolvedSuggestedPrice
            : (resolvedBasePrice !== undefined ? roundPrice(resolvedBasePrice * inflationFactor, resolvedRoundingStep) : 0);
        const summaryApplied = resolvedAppliedPrice !== undefined ? resolvedAppliedPrice : summarySuggested;
        const delta = Number(summaryApplied) - Number(summarySuggested);
        const deltaPct = computeDeltaPct(delta, summarySuggested);

        return {
            success: true,
            batchId: finalBatchId,
            percent: numPercent,
            step: resolvedRoundingStep,
            affectedRows,
            appliedAt: new Date().toISOString(),
            ledgerRecorded,
            period: resolvedPeriod,
            status: resolveAdjustmentStatus(delta),
            suggestedPrice: summarySuggested,
            appliedPrice: summaryApplied,
            delta,
            deltaPct,
            adjustmentReason: resolvedReason,
            source: resolvedSource
        };
    }

    async recordLedgerEntries({
        batchId,
        period,
        basePrice,
        inflationFactor,
        suggestedPrice,
        appliedPrice,
        roundingStep,
        adjustmentReason,
        source,
        userId
    }) {
        const { year, quarter } = parsePricePeriod(period);
        await pool.query(
            `INSERT INTO price_adjustment_periods (period, year, quarter, inflation_factor, effective_factor)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE inflation_factor = VALUES(inflation_factor), effective_factor = VALUES(effective_factor)`,
            [period, year, quarter, Number(inflationFactor), Number(inflationFactor)]
        );

        const rows = await pool.query(
            `SELECT scope, target_id, field, old_value, new_value, percent, rounding_step, user_id
               FROM price_changes
              WHERE batch_id = ?
              ORDER BY id ASC`,
            [batchId]
        );

        for (const [index, row] of rows.entries()) {
            const isOverrideTarget = index === 0;
            const rowBasePrice = isOverrideTarget && basePrice !== undefined ? Number(basePrice) : Number(row.old_value);
            const rowInflationFactor = row.percent !== null && row.percent !== undefined
                ? computeFactorFromPercent(row.percent)
                : Number(inflationFactor);
            const rowRoundingStep = Number(row.rounding_step || roundingStep);
            const rowSuggestedPrice = isOverrideTarget && suggestedPrice !== undefined
                ? Number(suggestedPrice)
                : roundPrice(rowBasePrice * rowInflationFactor, rowRoundingStep);
            const rowAppliedPrice = isOverrideTarget && appliedPrice !== undefined ? Number(appliedPrice) : Number(row.new_value);
            const delta = rowAppliedPrice - rowSuggestedPrice;
            const deltaPct = computeDeltaPct(delta, rowSuggestedPrice);

            await pool.query(
                `INSERT INTO price_adjustment_ledger (
                    batch_id, period, scope, target_id, field, base_price,
                    inflation_factor, effective_factor, applied_factor,
                    suggested_price, applied_price, delta, delta_pct,
                    rounding_step, adjustment_reason, source, status, user_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    batchId,
                    period,
                    row.scope,
                    Number(row.target_id),
                    row.field,
                    rowBasePrice,
                    rowInflationFactor,
                    computeEffectiveFactor(rowSuggestedPrice, rowBasePrice),
                    computeEffectiveFactor(rowAppliedPrice, rowBasePrice),
                    rowSuggestedPrice,
                    rowAppliedPrice,
                    delta,
                    deltaPct,
                    rowRoundingStep,
                    adjustmentReason,
                    normalizeSource(source),
                    resolveAdjustmentStatus(delta),
                    userId || row.user_id || null
                ]
            );
        }
    }

    async refreshDuePriceNotices({ batchId, days = 7 }) {
        const windowDays = Number(days) > 0 ? Number(days) : 7;
        const changedRows = await pool.query(
            `SELECT scope, target_id, field, old_value, new_value
               FROM price_changes
              WHERE batch_id = ?`,
            [batchId]
        );

        const doctorIds = [...new Set(changedRows
            .filter((row) => row.scope === 'doctors' && row.field === 'consultation_price')
            .map((row) => Number(row.target_id)))];

        if (doctorIds.length === 0) return { refreshed: 0 };

        const placeholders = doctorIds.map(() => '?').join(', ');
        const appointments = await pool.query(
            `SELECT id, doctor_id, appointment_date, cost
               FROM appointments
              WHERE doctor_id IN (${placeholders})
                AND appointment_date >= NOW()
                AND appointment_date < DATE_ADD(NOW(), INTERVAL ? DAY)
                AND status NOT IN ('cancelled', 'no_show', 'absent')`,
            [...doctorIds, windowDays]
        );

        const changeMap = new Map();
        for (const row of changedRows) {
            if (row.scope === 'doctors' && row.field === 'consultation_price') {
                changeMap.set(Number(row.target_id), {
                    oldValue: Number(row.old_value),
                    newValue: Number(row.new_value)
                });
            }
        }

        let refreshed = 0;
        for (const appt of appointments) {
            const change = changeMap.get(Number(appt.doctor_id));
            if (!change) continue;
            const quotedPrice = Number(change.oldValue);
            const currentPrice = Number(change.newValue);
            if (!quotedPrice || !currentPrice || quotedPrice === currentPrice) continue;
            const delta = currentPrice - quotedPrice;
            const daysBefore = Math.max(0, Math.ceil((new Date(appt.appointment_date).getTime() - Date.now()) / (24 * 60 * 60 * 1000)));

            await pool.query(
                `INSERT INTO price_variation_notices (
                    appointment_id, booking_reference, quoted_price, current_price, delta, days_before, notified_at
                ) VALUES (?, ?, ?, ?, ?, ?, NULL)
                ON DUPLICATE KEY UPDATE
                    current_price = VALUES(current_price),
                    delta = VALUES(delta),
                    days_before = VALUES(days_before),
                    booking_reference = COALESCE(VALUES(booking_reference), booking_reference)`,
                [Number(appt.id), `appt-${appt.id}`, quotedPrice, currentPrice, delta, daysBefore]
            );
            refreshed += 1;
        }

        return { refreshed };
    }


    async getClosingSummary(year) {
        const closingYear = Number(year);
        if (!Number.isInteger(closingYear)) {
            throw new Error('year must be an integer');
        }

        const rows = await pool.query(
            `SELECT year, inflation_yoy, applied_cumulative, margin, verdict
               FROM price_closing_summaries
              WHERE year = ?
              LIMIT 1`,
            [closingYear]
        );

        const row = rows[0];
        if (!row) return null;

        const inflationYoY = Number(row.inflation_yoy);
        const appliedCumulative = Number(row.applied_cumulative);
        const margin = row.margin !== null && row.margin !== undefined
            ? Number(row.margin)
            : computeMargin(appliedCumulative, inflationYoY);

        return {
            year: Number(row.year),
            inflationYoY,
            appliedCumulative,
            margin,
            verdict: row.verdict || resolveVerdict(margin)
        };
    }

    async getLedger(year) {
        const closingYear = Number(year);
        if (!Number.isInteger(closingYear)) {
            throw new Error('year must be an integer');
        }

        const rows = await pool.query(
            `SELECT period, inflation_factor, applied_factor, suggested_price, applied_price,
                    delta, delta_pct, adjustment_reason, source
               FROM price_adjustment_ledger
              WHERE period LIKE ?
              ORDER BY period ASC, id ASC`,
            [`${closingYear}-%`]
        );

        return rows.map((row) => ({
            period: row.period,
            inflationFactor: Number(row.inflation_factor),
            appliedFactor: Number(row.applied_factor),
            suggestedPrice: Number(row.suggested_price),
            appliedPrice: Number(row.applied_price),
            delta: Number(row.delta),
            deltaPct: Number(row.delta_pct),
            adjustmentReason: row.adjustment_reason,
            source: row.source
        }));
    }

    async listDuePriceNotices(days = 7) {
        const windowDays = Number(days) > 0 ? Number(days) : 7;
        const rows = await pool.query(
            `SELECT
                COALESCE(n.booking_reference, CONCAT('appt-', n.appointment_id)) AS booking_id,
                a.appointment_date AS appointment_at,
                n.quoted_price,
                n.current_price,
                n.delta,
                n.days_before,
                n.notified_at
             FROM price_variation_notices n
             JOIN appointments a ON a.id = n.appointment_id
            WHERE a.appointment_date >= NOW()
              AND a.appointment_date < DATE_ADD(NOW(), INTERVAL ? DAY)
              AND n.days_before <= ?
            ORDER BY a.appointment_date ASC, n.id ASC`,
            [windowDays, windowDays]
        );

        return rows.map((row) => ({
            bookingId: row.booking_id,
            appointmentAt: row.appointment_at instanceof Date ? row.appointment_at.toISOString() : row.appointment_at,
            quotedPrice: Number(row.quoted_price),
            currentPrice: Number(row.current_price),
            delta: Number(row.delta),
            daysBefore: Number(row.days_before),
            notifiedAt: row.notified_at ? (row.notified_at instanceof Date ? row.notified_at.toISOString() : row.notified_at) : null
        }));
    }
}

module.exports = new PriceAdjustmentService();
