const systemSettingsRepository = require('../../repositories/system/systemSettingsRepository');
const clinicKnowledgeRepository = require('../../repositories/system/clinicKnowledgeRepository');

const CACHE_TTL_MS = 60 * 1000;

const AI_SETTING_KEYS = [
    'clinic_name',
    'clinic_address',
    'secretary_hours',
    'ai_system_role',
    'ai_operational_rules',
    'ai_allowed_intents',
    'ai_emergency_terms',
    'ai_emergency_reply',
    'ai_restricted_terms',
    'ai_restricted_reply'
];

// Herramientas que ESTE backend puede ejecutar. La descripción es lo que el
// motor de IA necesita para decidir cuándo pedirlas.
const AVAILABLE_TOOLS = [
    {
        name: 'getDoctorSchedule',
        description: 'Consulta los días y horarios de atención de un médico',
        params: ['doctorName']
    },
    {
        name: 'getDoctorAvailability',
        description: 'Consulta los próximos turnos libres en agenda para una fecha',
        params: ['doctorName', 'date']
    }
];

const NEUTRAL_REPLY = 'Hola. Solo puedo ayudarte con consultas relacionadas al servicio.';

const cache = { tenantId: null, expiresAt: 0, value: null };

function invalidateCache() {
    cache.tenantId = null;
    cache.expiresAt = 0;
    cache.value = null;
}

/**
 * Acepta listas guardadas como JSON (`["a","b"]`) o separadas por comas/saltos
 * de línea. Devuelve `null` cuando no hay configuración para que el motor use
 * su comportamiento abierto por defecto.
 */
function parseList(raw) {
    if (raw === null || raw === undefined) return null;
    const text = String(raw).trim();
    if (!text) return null;

    let items;
    if (text.startsWith('[')) {
        try {
            const parsed = JSON.parse(text);
            items = Array.isArray(parsed) ? parsed : [];
        } catch {
            items = text.split(',');
        }
    } else {
        items = text.split(/[,\n]/);
    }

    const cleaned = items
        .map(item => String(item).trim())
        .filter(item => item.length > 0);

    return cleaned.length > 0 ? cleaned : null;
}

function buildGuardrail(terms, reply, actionRequired, intent, urgency) {
    if (!terms) return null;
    return {
        terms,
        reply: reply || NEUTRAL_REPLY,
        actionRequired,
        intent,
        urgency
    };
}

function buildSystemConfig(settings) {
    const config = {
        availableTools: AVAILABLE_TOOLS,
        neutralReply: NEUTRAL_REPLY
    };

    if (settings.ai_system_role) config.systemRole = settings.ai_system_role;

    const rules = parseList(settings.ai_operational_rules);
    if (rules) config.operationalRules = rules;

    const intents = parseList(settings.ai_allowed_intents);
    if (intents) config.allowedIntents = intents;

    const emergency = buildGuardrail(
        parseList(settings.ai_emergency_terms),
        settings.ai_emergency_reply,
        'ESCALATE_HUMAN',
        'EMERGENCIA_VITAL',
        'alta'
    );
    if (emergency) config.emergencyGuardrail = emergency;

    const restricted = buildGuardrail(
        parseList(settings.ai_restricted_terms),
        settings.ai_restricted_reply,
        'ESCALATE_HUMAN',
        'PRESCRIPCION_RESTRINGIDA',
        'baja'
    );
    if (restricted) config.restrictedGuardrail = restricted;

    return config;
}

async function loadConfig(tenantId, { force = false } = {}) {
    const now = Date.now();
    if (!force && cache.value && cache.tenantId === tenantId && cache.expiresAt > now) {
        return cache.value;
    }

    const [rows, documents] = await Promise.all([
        systemSettingsRepository.findManyByKeys(AI_SETTING_KEYS).catch(() => []),
        clinicKnowledgeRepository.findByTenant(tenantId).catch(() => [])
    ]);

    const settings = {};
    (rows || []).forEach(row => {
        settings[row.setting_key] = row.setting_value;
    });

    const value = {
        clinic: {
            name: settings.clinic_name || null,
            address: settings.clinic_address || null,
            secretaryHours: settings.secretary_hours || null
        },
        knowledge: (documents || []).map(doc => ({
            id: doc.document_id,
            title: doc.title,
            category: doc.category,
            content: doc.content
        })),
        systemConfig: buildSystemConfig(settings)
    };

    cache.tenantId = tenantId;
    cache.expiresAt = now + CACHE_TTL_MS;
    cache.value = value;

    return value;
}

/**
 * Arma el `businessContext` que consume el microservicio agnóstico. Todo dato
 * de dominio proviene de MariaDB; el llamador solo aporta los médicos (que a su
 * vez salen de la base) y la hora local.
 */
function buildBusinessContext({ config, doctors, currentTime }) {
    return {
        clinicName: config.clinic.name,
        address: config.clinic.address,
        secretaryHours: config.clinic.secretaryHours,
        currentTime,
        doctors: doctors || [],
        knowledge: config.knowledge
    };
}

module.exports = {
    AI_SETTING_KEYS,
    loadConfig,
    buildBusinessContext,
    buildSystemConfig,
    parseList,
    invalidateCache
};
