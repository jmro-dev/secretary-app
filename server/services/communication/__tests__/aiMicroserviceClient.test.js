jest.mock('axios');
jest.mock('../whatsappService', () => ({
    sendMessageDirect: jest.fn()
}));
jest.mock('../../appointments/availabilitySearchService', () => ({
    getNextFreeSlot: jest.fn()
}));
jest.mock('../../../repositories/communication/pendingBookingRepository', () => ({
    create: jest.fn()
}));
jest.mock('../../../repositories/appointments/appointmentRepository', () => ({
    findLastByPatientId: jest.fn()
}));
jest.mock('../../../repositories/user/doctorRepository', () => ({
    findFirst: jest.fn(),
    findById: jest.fn()
}));
jest.mock('@sentry/node', () => ({
    captureException: jest.fn()
}));

const axios = require('axios');
const whatsappService = require('../whatsappService');
const pendingBookingRepository = require('../../../repositories/communication/pendingBookingRepository');
const availabilitySearchService = require('../../appointments/availabilitySearchService');
const aiMicroserviceClient = require('../aiMicroserviceClient');

describe('aiMicroserviceClient - Delegation to edi3-ai-production', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('delegates message and dispatches suggestedReply when REPLY_ONLY', async () => {
        axios.post.mockResolvedValueOnce({
            data: {
                intent: 'INFORMACION_HORARIOS',
                confidence: 0.95,
                actionRequired: 'REPLY_ONLY',
                suggestedReply: 'La secretaría atiende hasta las 14:00 hs.',
                ragSources: ['atencion_y_modalidades.md']
            }
        });

        const res = await aiMicroserviceClient.processInboundMessage({
            sender: '5492494523129@s.whatsapp.net',
            message: 'En que horario atiende la secretaria?',
            patientId: 8563,
            phone: '5492494523129'
        });

        expect(res.intent).toBe('INFORMACION_HORARIOS');
        expect(whatsappService.sendMessageDirect).toHaveBeenCalledWith(
            '5492494523129',
            'La secretaría atiende hasta las 14:00 hs.',
            8563
        );
        expect(pendingBookingRepository.create).not.toHaveBeenCalled();
    });

    it('creates pending booking when actionRequired is CREATE_PENDING_BOOKING', async () => {
        axios.post.mockResolvedValueOnce({
            data: {
                intent: 'SOLICITUD_TURNO',
                confidence: 0.98,
                actionRequired: 'CREATE_PENDING_BOOKING',
                suggestedReply: 'Registramos tu solicitud de turno para Maria Cecilia Scheerle.',
                ragSources: ['atencion_y_modalidades.md']
            }
        });

        availabilitySearchService.getNextFreeSlot.mockResolvedValueOnce({
            results: [{ date: '2026-11-16', slots: [{ time: '08:30' }] }]
        });
        pendingBookingRepository.create.mockResolvedValueOnce(77);

        const res = await aiMicroserviceClient.processInboundMessage({
            sender: '5492494523129@s.whatsapp.net',
            message: 'Hola quiero un turno con Cecilia',
            patientId: 8563,
            phone: '5492494523129'
        });

        expect(res.intent).toBe('SOLICITUD_TURNO');
        expect(pendingBookingRepository.create).toHaveBeenCalledWith(expect.objectContaining({
            patient_id: 8563,
            requested_slot_date: '2026-11-16',
            requested_slot_time: '08:30'
        }));
        expect(whatsappService.sendMessageDirect).toHaveBeenCalledWith(
            '5492494523129',
            'Registramos tu solicitud de turno para Maria Cecilia Scheerle.',
            8563
        );
    });
});
