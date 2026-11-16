jest.mock('../../../repositories/system/systemSettingsRepository', () => ({
    findManyByKeys: jest.fn()
}));
jest.mock('../../../repositories/system/clinicKnowledgeRepository', () => ({
    findByTenant: jest.fn()
}));

const systemSettingsRepository = require('../../../repositories/system/systemSettingsRepository');
const clinicKnowledgeRepository = require('../../../repositories/system/clinicKnowledgeRepository');
const aiConfigService = require('../aiConfigService');

function settingsRows(values) {
    return Object.entries(values).map(([setting_key, setting_value]) => ({ setting_key, setting_value }));
}

describe('aiConfigService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        aiConfigService.invalidateCache();
        clinicKnowledgeRepository.findByTenant.mockResolvedValue([]);
        systemSettingsRepository.findManyByKeys.mockResolvedValue([]);
    });

    it('builds the systemConfig dynamically from system_settings', async () => {
        systemSettingsRepository.findManyByKeys.mockResolvedValueOnce(settingsRows({
            ai_system_role: 'Eres el asistente del consultorio.',
            ai_operational_rules: 'No confirmes turnos.\nNo emitas recetas.',
            ai_allowed_intents: 'SOLICITUD_TURNO,OTRO',
            ai_emergency_terms: '["pecho","desmayo"]',
            ai_emergency_reply: 'Acudí a una guardia.',
            ai_restricted_terms: 'clonazepam,receta',
            ai_restricted_reply: 'No se emiten recetas por WhatsApp.'
        }));

        const config = await aiConfigService.loadConfig('cima-salud');

        expect(config.systemConfig.systemRole).toBe('Eres el asistente del consultorio.');
        expect(config.systemConfig.operationalRules).toEqual(['No confirmes turnos.', 'No emitas recetas.']);
        expect(config.systemConfig.allowedIntents).toEqual(['SOLICITUD_TURNO', 'OTRO']);
        expect(config.systemConfig.emergencyGuardrail).toEqual(expect.objectContaining({
            terms: ['pecho', 'desmayo'],
            reply: 'Acudí a una guardia.',
            actionRequired: 'ESCALATE_HUMAN',
            intent: 'EMERGENCIA_VITAL',
            urgency: 'alta'
        }));
        expect(config.systemConfig.restrictedGuardrail).toEqual(expect.objectContaining({
            terms: ['clonazepam', 'receta'],
            reply: 'No se emiten recetas por WhatsApp.'
        }));
        expect(config.systemConfig.availableTools.map(t => t.name)).toEqual([
            'getDoctorSchedule',
            'getDoctorAvailability'
        ]);
    });

    it('omits domain fields when settings are absent instead of inventing them', async () => {
        const config = await aiConfigService.loadConfig('cima-salud');

        expect(config.systemConfig.systemRole).toBeUndefined();
        expect(config.systemConfig.operationalRules).toBeUndefined();
        expect(config.systemConfig.allowedIntents).toBeUndefined();
        expect(config.systemConfig.emergencyGuardrail).toBeUndefined();
        expect(config.systemConfig.restrictedGuardrail).toBeUndefined();
        expect(config.systemConfig.neutralReply).toBeTruthy();
        expect(config.clinic.name).toBeNull();
    });

    it('exposes active knowledge documents in the business context', async () => {
        clinicKnowledgeRepository.findByTenant.mockResolvedValueOnce([
            { document_id: 'aranceles_y_pagos', title: 'Aranceles', category: 'aranceles', content: 'Particular.' }
        ]);

        const config = await aiConfigService.loadConfig('cima-salud');
        const businessContext = aiConfigService.buildBusinessContext({
            config,
            doctors: [{ id: 10, name: 'Scheerle' }],
            currentTime: 'lunes'
        });

        expect(businessContext).toEqual(expect.objectContaining({
            currentTime: 'lunes',
            doctors: [{ id: 10, name: 'Scheerle' }],
            knowledge: [{ id: 'aranceles_y_pagos', title: 'Aranceles', category: 'aranceles', content: 'Particular.' }]
        }));
    });

    it('caches the configuration until invalidated', async () => {
        await aiConfigService.loadConfig('cima-salud');
        await aiConfigService.loadConfig('cima-salud');
        expect(systemSettingsRepository.findManyByKeys).toHaveBeenCalledTimes(1);

        aiConfigService.invalidateCache();
        await aiConfigService.loadConfig('cima-salud');
        expect(systemSettingsRepository.findManyByKeys).toHaveBeenCalledTimes(2);
    });

    it('keeps working when the database reads fail', async () => {
        systemSettingsRepository.findManyByKeys.mockRejectedValueOnce(new Error('db down'));
        clinicKnowledgeRepository.findByTenant.mockRejectedValueOnce(new Error('db down'));

        const config = await aiConfigService.loadConfig('cima-salud');

        expect(config.knowledge).toEqual([]);
        expect(config.systemConfig.availableTools).toHaveLength(2);
    });
});
