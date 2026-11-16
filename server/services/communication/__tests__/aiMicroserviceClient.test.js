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
jest.mock('../../../repositories/communication/whatsappRepository', () => ({
    getHistoryByPatient: jest.fn().mockResolvedValue([])
}));
jest.mock('../../../repositories/appointments/appointmentRepository', () => ({
    findLastByPatientId: jest.fn()
}));
jest.mock('../../../repositories/appointments/scheduleRepository', () => ({
    findByDoctor: jest.fn().mockResolvedValue([])
}));
jest.mock('../../../repositories/user/doctorRepository', () => ({
    findFirst: jest.fn(),
    findById: jest.fn(),
    findAll: jest.fn()
}));
jest.mock('../aiConfigService', () => {
    const actual = jest.requireActual('../aiConfigService');
    return {
        ...actual,
        loadConfig: jest.fn()
    };
});
jest.mock('@sentry/node', () => ({
    captureException: jest.fn(),
    captureMessage: jest.fn()
}));

const axios = require('axios');
const doctorRepository = require('../../../repositories/user/doctorRepository');
const appointmentRepository = require('../../../repositories/appointments/appointmentRepository');
const whatsappService = require('../whatsappService');
const pendingBookingRepository = require('../../../repositories/communication/pendingBookingRepository');
const availabilitySearchService = require('../../appointments/availabilitySearchService');
const aiConfigService = require('../aiConfigService');
const Sentry = require('@sentry/node');
const aiMicroserviceClient = require('../aiMicroserviceClient');

const CONFIG = {
    clinic: {
        name: 'Cima Salud Tandil',
        address: 'Montiel 1255, Tandil (entre Pellegrini y Montevideo)',
        secretaryHours: 'Lunes a Viernes hasta las 14:00 hs'
    },
    knowledge: [
        { id: 'atencion_y_modalidades', title: 'Atención', category: 'atencion', content: 'Horario según agenda.' }
    ],
    systemConfig: {
        systemRole: 'Eres el asistente virtual oficial.',
        allowedIntents: ['SOLICITUD_TURNO', 'INFORMACION_HORARIOS', 'OTRO']
    }
};

describe('aiMicroserviceClient - Delegation to edi3-ai-production', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        aiConfigService.loadConfig.mockResolvedValue(CONFIG);
        doctorRepository.findAll.mockResolvedValue([
            { id: 10, full_name: 'Maria Cecilia Scheerle', specialty: 'Psiquiatra', consultation_price: 65000 }
        ]);
    });

    it('builds businessContext and systemConfig from the database configuration', async () => {
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
        expect(axios.post).toHaveBeenCalledWith(
            expect.stringContaining('/api/v1/patient-message'),
            expect.objectContaining({
                systemConfig: CONFIG.systemConfig,
                businessContext: expect.objectContaining({
                    clinicName: 'Cima Salud Tandil',
                    secretaryHours: 'Lunes a Viernes hasta las 14:00 hs',
                    address: 'Montiel 1255, Tandil (entre Pellegrini y Montevideo)',
                    doctors: [expect.objectContaining({ id: 10, consultationPrice: 65000 })],
                    knowledge: CONFIG.knowledge
                })
            }),
            expect.any(Object)
        );
        expect(whatsappService.sendMessageDirect).toHaveBeenCalledWith(
            '5492494523129',
            'La secretaría atiende hasta las 14:00 hs.',
            8563
        );
        expect(pendingBookingRepository.create).not.toHaveBeenCalled();
    });

    it('does not floor a doctor consultation price', async () => {
        doctorRepository.findAll.mockResolvedValueOnce([
            { id: 10, full_name: 'Maria Cecilia Scheerle', specialty: 'Psiquiatra', consultation_price: 500 }
        ]);
        axios.post.mockResolvedValueOnce({
            data: {
                intent: 'OTRO',
                confidence: 0.9,
                actionRequired: 'REPLY_ONLY',
                suggestedReply: 'ok'
            }
        });

        await aiMicroserviceClient.processInboundMessage({
            sender: '5492494523129@s.whatsapp.net',
            message: 'cuanto sale',
            patientId: 8563,
            phone: '5492494523129'
        });

        const payload = axios.post.mock.calls[0][1];
        expect(payload.businessContext.doctors[0].consultationPrice).toBe(500);
    });

    it('creates pending booking when actionRequired is CREATE_PENDING_BOOKING', async () => {
        axios.post.mockResolvedValueOnce({
            data: {
                intent: 'SOLICITUD_TURNO',
                confidence: 0.98,
                actionRequired: 'CREATE_PENDING_BOOKING',
                entities: { doctorName: 'Scheerle' },
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
            doctor_id: 10,
            requested_slot_date: '2026-11-16',
            requested_slot_time: '08:30'
        }));
        expect(whatsappService.sendMessageDirect).toHaveBeenCalledWith(
            '5492494523129',
            'Registramos tu solicitud de turno para Maria Cecilia Scheerle.',
            8563
        );
    });

    it('silences the patient and logs when inference is unavailable', async () => {
        axios.post.mockResolvedValueOnce({
            data: { ok: false, error: 'INFERENCE_UNAVAILABLE', latencyMs: 20000 }
        });

        const res = await aiMicroserviceClient.processInboundMessage({
            sender: '5492494523129@s.whatsapp.net',
            message: 'Hola',
            patientId: 8563,
            phone: '5492494523129'
        });

        expect(res).toBeNull();
        expect(whatsappService.sendMessageDirect).not.toHaveBeenCalled();
        expect(pendingBookingRepository.create).not.toHaveBeenCalled();
        expect(Sentry.captureMessage).toHaveBeenCalledWith('INFERENCE_UNAVAILABLE', expect.any(Object));
    });

    it('never invents a doctor id for a pending booking', async () => {
        doctorRepository.findAll.mockResolvedValueOnce([]);
        appointmentRepository.findLastByPatientId.mockResolvedValueOnce(null);
        doctorRepository.findFirst.mockResolvedValueOnce(null);
        axios.post.mockResolvedValueOnce({
            data: {
                intent: 'SOLICITUD_TURNO',
                confidence: 0.9,
                actionRequired: 'CREATE_PENDING_BOOKING',
                entities: {},
                suggestedReply: 'ok'
            }
        });

        const res = await aiMicroserviceClient.processInboundMessage({
            sender: '5492494523129@s.whatsapp.net',
            message: 'Quiero un turno',
            patientId: 8563,
            phone: '5492494523129'
        });

        expect(res).not.toBeNull();
        expect(pendingBookingRepository.create).not.toHaveBeenCalled();
        expect(Sentry.captureMessage).toHaveBeenCalledWith('PENDING_BOOKING_WITHOUT_DOCTOR', expect.any(Object));
    });

    describe('checkHealth', () => {
        it('returns health payload when microservice is online', async () => {
            axios.get.mockResolvedValueOnce({
                status: 200,
                data: { status: 'ok', uptime: 123.45 }
            });

            const health = await aiMicroserviceClient.checkHealth();
            expect(health).toEqual({ status: 'ok', uptime: 123.45 });
        });

        it('returns null when microservice fails or returns error', async () => {
            axios.get.mockRejectedValueOnce(new Error('Connection refused'));

            const health = await aiMicroserviceClient.checkHealth();
            expect(health).toBeNull();
        });
    });

    describe('syncKnowledgeDocument', () => {
        it('syncs document via POST /api/v1/knowledge/documents', async () => {
            axios.post.mockResolvedValueOnce({
                status: 201,
                data: { status: 'indexed', documentId: 'test_doc', chunksIndexed: 2 }
            });

            const res = await aiMicroserviceClient.syncKnowledgeDocument({
                tenantId: 'cima-salud',
                documentId: 'test_doc',
                title: 'Test Doc',
                content: 'Test content for rag'
            });

            expect(axios.post).toHaveBeenCalledWith(
                expect.stringContaining('/api/v1/knowledge/documents'),
                {
                    tenantId: 'cima-salud',
                    documentId: 'test_doc',
                    title: 'Test Doc',
                    content: 'Test content for rag'
                },
                expect.any(Object)
            );
            expect(res).toEqual({ status: 'indexed', documentId: 'test_doc', chunksIndexed: 2 });
        });

        it('returns null on failure without throwing', async () => {
            axios.post.mockRejectedValueOnce(new Error('Timeout'));

            const res = await aiMicroserviceClient.syncKnowledgeDocument({
                tenantId: 'cima-salud',
                documentId: 'test_doc',
                title: 'Test Doc',
                content: 'Test content for rag'
            });

            expect(res).toBeNull();
        });
    });
});
