jest.mock('../../db', () => ({
    pool: {
        query: jest.fn()
    }
}));
jest.mock('../../services/finance/priceAdjustmentService');
jest.mock('../../services/finance/financeService');
jest.mock('../../services/finance/statsService');
jest.mock('../../utils/system/audit', () => ({
    logAction: jest.fn()
}));

const FinanceController = require('../finance/financeController');
const priceAdjustmentService = require('../../services/finance/priceAdjustmentService');

describe('FinanceController - Price Adjustments (#711)', () => {
    let controller;
    let req;
    let res;

    beforeEach(() => {
        jest.clearAllMocks();
        controller = new FinanceController({});
        req = {
            query: {},
            body: {},
            user: { user_id: 1, role: 'admin' }
        };
        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis()
        };
    });

    describe('getInflationAdjustment', () => {
        it('returns inflation data with status 200', async () => {
            req.query.since = '2026-07-01';
            const mockInflation = {
                available: true,
                percent: 5.88,
                from: '2026-07',
                to: '2026-10',
                source: 'INDEC',
                asOf: '2026-10-01',
                months: 3
            };
            priceAdjustmentService.getInflation.mockResolvedValueOnce(mockInflation);

            await controller.getInflationAdjustment(req, res);

            expect(priceAdjustmentService.getInflation).toHaveBeenCalledWith('2026-07-01');
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                success: true,
                data: mockInflation,
                error: null
            });
        });
    });

    describe('getPriceAdjustmentStatus', () => {
        it('returns status with isAdjustmentPending', async () => {
            const mockStatus = {
                lastAdjustedAt: '2026-08-01T00:00:00.000Z',
                lastBatchId: 'batch-123',
                daysSinceLastAdjustment: 114,
                isAdjustmentPending: true,
                recommendedCadenceDays: 90
            };
            priceAdjustmentService.getStatus.mockResolvedValueOnce(mockStatus);

            await controller.getPriceAdjustmentStatus(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                success: true,
                data: mockStatus,
                error: null
            });
        });
    });

    describe('previewPriceIncrease', () => {
        it('returns 400 if percent parameter is missing', async () => {
            await controller.previewPriceIncrease(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                data: null,
                error: expect.stringContaining("Param 'percent' is required")
            });
        });

        it('returns preview data for valid percent and step', async () => {
            req.query = { percent: '10.5', step: '500', scope: 'doctors,institutions' };
            const mockPreview = {
                percent: 10.5,
                step: 500,
                count: 2,
                items: [
                    { scope: 'doctors', targetId: 1, field: 'consultation_price', oldValue: 20000, newValue: 22500 }
                ]
            };
            priceAdjustmentService.previewIncrease.mockResolvedValueOnce(mockPreview);

            await controller.previewPriceIncrease(req, res);

            expect(priceAdjustmentService.previewIncrease).toHaveBeenCalledWith({
                percent: 10.5,
                step: 500,
                scope: ['doctors', 'institutions']
            });
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                success: true,
                data: mockPreview,
                error: null
            });
        });
    });

    describe('applyPriceIncrease', () => {
        it('returns 400 if percent is missing', async () => {
            await controller.applyPriceIncrease(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                data: null,
                error: expect.stringContaining("Param 'percent' is required")
            });
        });

        it('applies increase successfully and returns 200 with result', async () => {
            req.body = {
                percent: 12.5,
                step: 500,
                scope: ['doctors'],
                inflationSource: 'INDEC',
                inflationPeriod: '2026-10'
            };
            const mockResult = {
                success: true,
                batchId: 'uuid-test-123',
                affectedRows: 5,
                percent: 12.5,
                step: 500
            };
            priceAdjustmentService.applyIncrease.mockResolvedValueOnce(mockResult);

            await controller.applyPriceIncrease(req, res);

            expect(priceAdjustmentService.applyIncrease).toHaveBeenCalledWith({
                percent: 12.5,
                step: 500,
                scope: ['doctors'],
                batchId: undefined,
                inflationSource: 'INDEC',
                inflationPeriod: '2026-10',
                userId: 1
            });
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                success: true,
                data: mockResult,
                error: null
            });
        });
    });
});
