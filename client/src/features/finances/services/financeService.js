import { api } from '@/api/axios';

export const financeService = {
    getPricing: async (doctorId, patientId, serviceType) => {
        const response = await api.post(`/finances/pricing`, {
            doctor_id: doctorId,
            patientId: patientId,
            service_type: serviceType
        });
        return response.data?.data || response.data;
    },

    createTransaction: async (data) => {
        const response = await api.post('/finances/transactions', data);
        return response.data;
    },

    getPatientCredit: async (patientId) => {
        const response = await api.get(`/finances/patient-credit/${patientId}`);
        return response.data?.data || response.data;
    },

    getPriceAdjustmentStatus: async () => {
        const response = await api.get('/finances/prices/status');
        return response.data?.data || response.data;
    },

    getInflationAdjustment: async (since) => {
        const response = await api.get('/finances/prices/inflation', {
            params: since ? { since } : {}
        });
        return response.data?.data || response.data;
    },

    previewPriceIncrease: async ({ percent, step = 500, scope = ['doctors', 'institutions'], period, basePrice }) => {
        const response = await api.get('/finances/prices/preview', {
            params: {
                percent,
                step,
                scope: Array.isArray(scope) ? scope.join(',') : scope,
                ...(period ? { period } : {}),
                ...(basePrice !== undefined ? { basePrice } : {})
            }
        });
        return response.data?.data || response.data;
    },

    applyPriceIncrease: async (data) => {
        const response = await api.post('/finances/prices/apply', data);
        return response.data?.data || response.data;
    },

    getPriceClosingSummary: async (year) => {
        const response = await api.get('/finances/prices/closing', { params: { year } });
        return response.data?.data || response.data;
    },

    getPriceLedger: async (year) => {
        const response = await api.get('/finances/prices/ledger', { params: { year } });
        return response.data?.data || response.data;
    },

    getDuePriceNotices: async (days = 7) => {
        const response = await api.get('/finances/bookings/due-price-notices', { params: { days } });
        return response.data?.data || response.data;
    }
};
