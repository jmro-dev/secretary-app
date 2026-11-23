const priceAdjustmentService = require('./priceAdjustmentService');
const axios = require('axios');
const { pool } = require('../../db');

jest.mock('axios');
jest.mock('../../db', () => ({
    pool: {
        query: jest.fn()
    }
}));

describe('PriceAdjustmentService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        priceAdjustmentService.clearCache();
    });

    describe('getInflation', () => {
        it('calculates ratio of indices correctly from INDEC primary API', async () => {
            axios.get.mockResolvedValueOnce({
                data: {
                    data: [
                        ['2026-10-01', 12785.9321],
                        ['2026-09-01', 12514.1508],
                        ['2026-08-01', 12276.7660],
                        ['2026-07-01', 12076.3937]
                    ]
                }
            });

            // since = '2026-07-01'
            const result = await priceAdjustmentService.getInflation('2026-07-01');

            expect(result.available).toBe(true);
            expect(result.source).toBe('INDEC');
            expect(result.from).toBe('2026-07');
            expect(result.to).toBe('2026-10');
            // Ratio: ((12785.9321 / 12076.3937) - 1) * 100 = 5.8754%
            expect(result.percent).toBeCloseTo(5.8754, 3);
            expect(result.months).toBe(3);
        });

        it('uses in-memory cache on subsequent call with same since key', async () => {
            axios.get.mockResolvedValueOnce({
                data: {
                    data: [
                        ['2026-10-01', 12785.9321],
                        ['2026-09-01', 12514.1508],
                        ['2026-08-01', 12276.7660],
                        ['2026-07-01', 12076.3937]
                    ]
                }
            });

            const res1 = await priceAdjustmentService.getInflation('2026-07-01');
            const res2 = await priceAdjustmentService.getInflation('2026-07-01');

            expect(axios.get).toHaveBeenCalledTimes(1);
            expect(res1).toEqual(res2);
        });

        it('falls back to argentinadatos if INDEC fails', async () => {
            // First call to INDEC fails
            axios.get.mockRejectedValueOnce(new Error('INDEC API timeout'));
            // Fallback to argentinadatos succeeds
            axios.get.mockResolvedValueOnce({
                data: [
                    { fecha: '2026-08-31', valor: 1.7 },
                    { fecha: '2026-09-30', valor: 1.9 },
                    { fecha: '2026-10-31', valor: 2.2 }
                ]
            });

            const result = await priceAdjustmentService.getInflation('2026-08-01');

            expect(result.available).toBe(true);
            expect(result.source).toBe('argentinadatos');
            // Compounding: (1.017 * 1.019 * 1.022 - 1) * 100 = 5.912%
            expect(result.percent).toBeGreaterThan(5.8);
            expect(result.months).toBe(3);
        });

        it('returns available: false gracefully when both INDEC and fallback fail', async () => {
            axios.get.mockRejectedValue(new Error('Network error'));

            const result = await priceAdjustmentService.getInflation('2026-07-01');

            expect(result.available).toBe(false);
            expect(result.reason).toBeDefined();
        });
    });

    describe('getStatus', () => {
        it('reports adjustment pending when last adjustment was more than 90 days ago', async () => {
            const date100DaysAgo = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
            pool.query.mockResolvedValueOnce([
                {
                    last_adjusted_at: date100DaysAgo,
                    last_batch_id: 'batch-abc-123',
                    total_batches: 2,
                    total_records: 12
                }
            ]);

            const status = await priceAdjustmentService.getStatus();

            expect(status.isAdjustmentPending).toBe(true);
            expect(status.daysSinceLastAdjustment).toBeGreaterThanOrEqual(99);
            expect(status.lastBatchId).toBe('batch-abc-123');
        });

        it('reports adjustment NOT pending when last adjustment was recent (e.g. 20 days ago)', async () => {
            const date20DaysAgo = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
            pool.query.mockResolvedValueOnce([
                {
                    last_adjusted_at: date20DaysAgo,
                    last_batch_id: 'batch-recent',
                    total_batches: 1,
                    total_records: 6
                }
            ]);

            const status = await priceAdjustmentService.getStatus();

            expect(status.isAdjustmentPending).toBe(false);
            expect(status.daysSinceLastAdjustment).toBeLessThan(90);
        });

        it('reports adjustment pending when no previous adjustments exist in database', async () => {
            pool.query.mockResolvedValueOnce([
                {
                    last_adjusted_at: null,
                    last_batch_id: null,
                    total_batches: 0,
                    total_records: 0
                }
            ]);

            const status = await priceAdjustmentService.getStatus();

            expect(status.isAdjustmentPending).toBe(true);
            expect(status.daysSinceLastAdjustment).toBeNull();
            expect(status.lastBatchId).toBeNull();
        });
    });

    describe('previewIncrease', () => {
        it('throws error if percent is <= -100', async () => {
            await expect(
                priceAdjustmentService.previewIncrease({ percent: -100 })
            ).rejects.toThrow('percent must be greater than -100');

            await expect(
                priceAdjustmentService.previewIncrease({ percent: -105 })
            ).rejects.toThrow('percent must be greater than -100');
        });

        it('calculates preview with CEIL commercial rounding to 500', async () => {
            pool.query.mockImplementation((sql) => {
                if (sql.includes('FROM doctors')) {
                    return Promise.resolve([
                        {
                            id: 1,
                            name: 'Dr. House',
                            consultation_price: 23101, // 23101 * 1.125 = 25988.625 -> 26000
                            prescription_price: 70000, // 70000 * 1.125 = 78750 -> 79000
                            medical_license_price: 0,
                            certificate_price: 45000, // 45000 * 1.125 = 50625 -> 51000
                            virtual_consultation_price: 60000 // 60000 * 1.125 = 67500 -> 67500
                        }
                    ]);
                }
                if (sql.includes('FROM institutions')) {
                    return Promise.resolve([
                        {
                            id: 10,
                            name: 'Clínica Central',
                            base_price: 20000 // 20000 * 1.125 = 22500 -> 22500
                        }
                    ]);
                }
                return Promise.resolve([]);
            });

            const preview = await priceAdjustmentService.previewIncrease({
                percent: 12.5,
                step: 500,
                scope: ['doctors', 'institutions'],
                period: '2026-Q2',
                basePrice: 70000
            });

            expect(preview.percent).toBe(12.5);
            expect(preview.step).toBe(500);
            expect(preview.count).toBe(5); // 4 doctor fields > 0 + 1 institution
            expect(preview.period).toBe('2026-Q2');
            expect(preview.basePrice).toBe(70000);
            expect(preview.inflationFactor).toBeCloseTo(1.125, 6);
            expect(preview.suggestedPrice).toBe(79000);
            expect(preview.roundingStep).toBe(500);
            expect(preview.scope).toEqual(['doctors', 'institutions']);
            expect(preview.rows).toHaveLength(5);

            const houseConsultation = preview.items.find(i => i.field === 'consultation_price');
            expect(houseConsultation.oldValue).toBe(23101);
            expect(houseConsultation.newValue).toBe(26000);
            expect(houseConsultation.difference).toBe(2899);

            const houseVirtual = preview.items.find(i => i.field === 'virtual_consultation_price');
            expect(houseVirtual.oldValue).toBe(60000);
            expect(houseVirtual.newValue).toBe(67500);

            const instBase = preview.items.find(i => i.field === 'base_price');
            expect(instBase.oldValue).toBe(20000);
            expect(instBase.newValue).toBe(22500);
        });

        it('filters by scope when only doctors is selected', async () => {
            pool.query.mockImplementation((sql) => {
                if (sql.includes('FROM doctors')) {
                    return Promise.resolve([
                        {
                            id: 1,
                            name: 'Dr. House',
                            consultation_price: 30000,
                            prescription_price: 0,
                            medical_license_price: 0,
                            certificate_price: 0,
                            virtual_consultation_price: 0
                        }
                    ]);
                }
                return Promise.resolve([]);
            });

            const preview = await priceAdjustmentService.previewIncrease({
                percent: 10,
                step: 500,
                scope: ['doctors']
            });

            expect(preview.count).toBe(1);
            expect(preview.items[0].scope).toBe('doctors');
        });
    });

    describe('applyIncrease', () => {
        it('invokes proc_apply_price_increase and returns batch metadata', async () => {
            pool.query.mockImplementation((sql, _params) => {
                if (sql.includes('CALL proc_apply_price_increase')) {
                    return Promise.resolve();
                }
                if (sql.includes('SELECT COUNT(*) AS affectedRows')) {
                    return Promise.resolve([{ affectedRows: 8 }]);
                }
                if (sql.includes('FROM price_changes') && sql.includes('ORDER BY id ASC')) {
                    return Promise.resolve([]);
                }
                return Promise.resolve([]);
            });

            const result = await priceAdjustmentService.applyIncrease({
                percent: 15.0,
                step: 500,
                scope: ['doctors', 'institutions'],
                inflationSource: 'INDEC',
                inflationPeriod: '2026-10',
                userId: 42
            });

            expect(result.success).toBe(true);
            expect(result.batchId).toBeDefined();
            expect(result.affectedRows).toBe(8);
            expect(result.percent).toBe(15.0);
            expect(result.step).toBe(500);

            expect(pool.query).toHaveBeenCalledWith(
                'CALL proc_apply_price_increase(?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    result.batchId,
                    15.0,
                    500,
                    1, // scopeDoctors
                    1, // scopeInstitutions
                    'INDEC',
                    '2026-10',
                    42
                ]
            );
        });

        it('records manual adjustment in ledger with same batch and computed delta', async () => {
            const batchId = 'batch-manual-1';
            pool.query.mockImplementation((sql) => {
                if (sql.includes('CALL proc_apply_price_increase')) return Promise.resolve();
                if (sql.includes('SELECT COUNT(*) AS affectedRows')) return Promise.resolve([{ affectedRows: 1 }]);
                if (sql.includes('FROM price_changes') && sql.includes('ORDER BY id ASC')) {
                    return Promise.resolve([{
                        scope: 'doctors',
                        target_id: 1,
                        field: 'consultation_price',
                        old_value: 70000,
                        new_value: 80000,
                        percent: 14.2857,
                        rounding_step: 500,
                        user_id: 7
                    }]);
                }
                if (sql.includes('INSERT INTO price_adjustment_periods')) return Promise.resolve({ affectedRows: 1 });
                if (sql.includes('INSERT INTO price_adjustment_ledger')) return Promise.resolve({ affectedRows: 1 });
                if (sql.includes('FROM price_changes') && sql.includes('WHERE batch_id = ?')) return Promise.resolve([]);
                return Promise.resolve([]);
            });

            const result = await priceAdjustmentService.applyIncrease({
                percent: 14.2857,
                step: 500,
                scope: ['doctors'],
                batchId,
                period: '2026-Q1',
                basePrice: 80000,
                suggestedPrice: 80000,
                appliedPrice: 90000,
                roundingStep: 500,
                adjustmentReason: 'Alta demanda de especialista',
                source: 'manual',
                userId: 7
            });

            const periodCall = pool.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO price_adjustment_periods'));
            expect(periodCall).toBeDefined();
            expect(periodCall[1]).toEqual(['2026-Q1', 2026, 1, expect.any(Number), expect.any(Number)]);

            const ledgerCall = pool.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO price_adjustment_ledger'));
            expect(ledgerCall).toBeDefined();
            expect(ledgerCall[1][0]).toBe(batchId);
            expect(ledgerCall[1][1]).toBe('2026-Q1');
            expect(ledgerCall[1][9]).toBe(80000);
            expect(ledgerCall[1][10]).toBe(90000);
            expect(ledgerCall[1][11]).toBe(10000);
            expect(ledgerCall[1][12]).toBeCloseTo(12.5, 3);
            expect(ledgerCall[1][15]).toBe('manual');
            expect(ledgerCall[1][16]).toBe('accepted_with_adjustment');
            expect(result.delta).toBe(10000);
            expect(result.deltaPct).toBeCloseTo(12.5, 3);
            expect(result.status).toBe('accepted_with_adjustment');
            expect(result.source).toBe('manual');
            expect(result.ledgerRecorded).toBe(true);

            expect(pool.query).toHaveBeenCalledWith(
                'UPDATE doctors SET consultation_price = ? WHERE id = ?',
                [90000, 1]
            );
            expect(pool.query).toHaveBeenCalledWith(
                expect.stringContaining('UPDATE price_changes'),
                [90000, batchId, 'doctors', 1, 'consultation_price']
            );
        });

        it('keeps per-row prices in the ledger when a manual applied price is supplied', async () => {
            const batchId = 'batch-manual-multi';
            pool.query.mockImplementation((sql) => {
                if (sql.includes('CALL proc_apply_price_increase')) return Promise.resolve();
                if (sql.includes('SELECT COUNT(*) AS affectedRows')) return Promise.resolve([{ affectedRows: 2 }]);
                if (sql.includes('FROM price_changes') && sql.includes('ORDER BY id ASC')) {
                    return Promise.resolve([
                        {
                            scope: 'doctors', target_id: 1, field: 'consultation_price',
                            old_value: 70000, new_value: 80000, percent: 14.2857,
                            rounding_step: 500, user_id: 7
                        },
                        {
                            scope: 'doctors', target_id: 2, field: 'consultation_price',
                            old_value: 50000, new_value: 60000, percent: 14.2857,
                            rounding_step: 500, user_id: 7
                        }
                    ]);
                }
                if (sql.includes('INSERT INTO price_adjustment_periods')) return Promise.resolve({ affectedRows: 1 });
                if (sql.includes('INSERT INTO price_adjustment_ledger')) return Promise.resolve({ affectedRows: 1 });
                if (sql.includes('FROM price_changes') && sql.includes('WHERE batch_id = ?')) return Promise.resolve([]);
                return Promise.resolve([]);
            });

            await priceAdjustmentService.applyIncrease({
                percent: 14.2857,
                step: 500,
                scope: ['doctors'],
                batchId,
                period: '2026-Q1',
                basePrice: 80000,
                suggestedPrice: 80000,
                appliedPrice: 90000,
                roundingStep: 500,
                adjustmentReason: 'Alta demanda de especialista',
                source: 'manual',
                userId: 7
            });

            const ledgerCalls = pool.query.mock.calls.filter(([sql]) => sql.includes('INSERT INTO price_adjustment_ledger'));
            expect(ledgerCalls).toHaveLength(2);

            expect(ledgerCalls[0][1][5]).toBe(80000);
            expect(ledgerCalls[0][1][9]).toBe(80000);
            expect(ledgerCalls[0][1][10]).toBe(90000);
            expect(ledgerCalls[0][1][16]).toBe('accepted_with_adjustment');

            expect(ledgerCalls[1][1][5]).toBe(50000);
            expect(ledgerCalls[1][1][9]).toBe(57500);
            expect(ledgerCalls[1][1][10]).toBe(60000);
            expect(ledgerCalls[1][1][16]).toBe('accepted_with_adjustment');

            const manualPriceUpdates = pool.query.mock.calls.filter(
                ([sql]) => typeof sql === 'string' && sql.includes('UPDATE doctors SET consultation_price = ?')
            );
            expect(manualPriceUpdates).toHaveLength(1);
            expect(manualPriceUpdates[0][1]).toEqual([90000, 1]);
        });

        it('rejects percent <= -100', async () => {
            await expect(
                priceAdjustmentService.applyIncrease({ percent: -100 })
            ).rejects.toThrow('percent must be greater than -100');
        });

        it('rejects when both doctors and institutions scopes are omitted', async () => {
            await expect(
                priceAdjustmentService.applyIncrease({ percent: 10, scope: [] })
            ).rejects.toThrow('At least one scope (doctors or institutions) must be selected');
        });
    });

    describe('calculations and read mappings', () => {
        it('uses compound factors and expected effective factor', () => {
            const compound = (1 + 0.02) * (1 + 0.02);
            expect(compound).toBeCloseTo(1.0404, 6);
            expect(Number(compound.toFixed(4))).not.toBe(1.04);
            const effective = 80000 / 70000;
            expect(effective).toBeCloseTo(1.142857, 6);
        });

        it('maps closing summary rows to contract fields', async () => {
            pool.query.mockResolvedValueOnce([{ year: 2026, inflation_yoy: 0.45, applied_cumulative: 0.4, margin: -0.05, verdict: 'cheaper' }]);
            const summary = await priceAdjustmentService.getClosingSummary(2026);
            expect(summary).toEqual({ year: 2026, inflationYoY: 0.45, appliedCumulative: 0.4, margin: -0.05, verdict: 'cheaper' });
        });

        it('maps ledger rows and filters by year', async () => {
            pool.query.mockResolvedValueOnce([{
                period: '2026-Q1', inflation_factor: 1.142857, applied_factor: 1.285714,
                suggested_price: 80000, applied_price: 90000, delta: 10000, delta_pct: 12.5,
                adjustment_reason: 'Alta demanda de especialista', source: 'manual'
            }]);

            const rows = await priceAdjustmentService.getLedger(2026);
            expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('WHERE period LIKE ?'), ['2026-%']);
            expect(rows[0]).toEqual({
                period: '2026-Q1', inflationFactor: 1.142857, appliedFactor: 1.285714,
                suggestedPrice: 80000, appliedPrice: 90000, delta: 10000, deltaPct: 12.5,
                adjustmentReason: 'Alta demanda de especialista', source: 'manual'
            });
        });

        it('lists due price notices with 7-day window and null notifiedAt', async () => {
            pool.query.mockResolvedValueOnce([{
                booking_id: 'bkg-711',
                appointment_at: '2026-12-15T10:30:00.000Z',
                quoted_price: 70000,
                current_price: 80000,
                delta: 10000,
                days_before: 7,
                notified_at: null
            }]);

            const rows = await priceAdjustmentService.listDuePriceNotices(7);
            expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('INTERVAL ? DAY'), [7, 7]);
            expect(rows).toEqual([{
                bookingId: 'bkg-711',
                appointmentAt: '2026-12-15T10:30:00.000Z',
                quotedPrice: 70000,
                currentPrice: 80000,
                delta: 10000,
                daysBefore: 7,
                notifiedAt: null
            }]);
        });
    });
});
