const axios = require('axios');
const Sentry = require('@sentry/node');
const doctorRepository = require('../../repositories/user/doctorRepository');
const scheduleRepository = require('../../repositories/appointments/scheduleRepository');
const appointmentRepository = require('../../repositories/appointments/appointmentRepository');
const pendingBookingRepository = require('../../repositories/communication/pendingBookingRepository');
const availabilitySearchService = require('../appointments/availabilitySearchService');
const whatsappRepository = require('../../repositories/communication/whatsappRepository');
const aiConfigService = require('./aiConfigService');
const { formatDateOnlySQL } = require('../../utils/core/dateUtils');

const AI_SERVICE_URL = process.env.EDI3_AI_SERVICE_URL || 'http://127.0.0.1:8000';
const TENANT_ID = process.env.EDI3_TENANT_ID || 'cima-salud';

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function formatTime(timeStr) {
    if (!timeStr) return '';
    return timeStr.slice(0, 5);
}

function formatSchedules(rawSchedules) {
    if (!Array.isArray(rawSchedules)) return [];
    return rawSchedules
        .filter(s => !s.is_break)
        .map(s => {
            const dayName = DAY_NAMES[s.day_of_week] || `Día ${s.day_of_week}`;
            const typeStr = s.default_type === 'virtual' ? ' (Virtual)' : ' (Presencial)';
            return `${dayName} de ${formatTime(s.start_time)} a ${formatTime(s.end_time)}${typeStr}`;
        });
}

async function resolveDoctorForPatient(patientId) {
    if (!patientId) return null;
    try {
        const lastAppt = await appointmentRepository.findLastByPatientId(patientId);
        if (lastAppt && lastAppt.doctor_id) {
            return lastAppt.doctor_id;
        }
        const first = await doctorRepository.findFirst();
        return first ? first.id : null;
    } catch (_e) {
        return null;
    }
}

async function buildDoctors() {
    const doctors = await doctorRepository.findAll();
    const mappedDoctors = [];

    if (Array.isArray(doctors)) {
        for (const d of doctors) {
            const docId = Number(d.id);
            let formattedSchedules = [];
            try {
                const rawSchedules = await scheduleRepository.findByDoctor(docId);
                formattedSchedules = formatSchedules(rawSchedules);
            } catch (_schedErr) {
                // Si falla la consulta de horarios, continuar con lista vacía
            }

            mappedDoctors.push({
                id: docId,
                name: d.full_name || `${d.first_name || ''} ${d.last_name || ''}`.trim(),
                specialty: d.specialty || 'General',
                consultationPrice: d.consultation_price === null || d.consultation_price === undefined
                    ? null
                    : Number(d.consultation_price),
                prescriptionPrice: Number(d.prescription_price || 0),
                schedules: formattedSchedules
            });
        }
    }

    return mappedDoctors;
}

function localTimeString() {
    return new Date().toLocaleDateString('es-AR', {
        timeZone: 'America/Argentina/Buenos_Aires',
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function isInferenceUnavailable(result) {
    return Boolean(result && result.ok === false && result.error === 'INFERENCE_UNAVAILABLE');
}

/**
 * Resuelve el médico para una pre-reserva usando primero lo que la IA extrajo
 * del mensaje y, como respaldo, el historial del paciente. Nunca inventa un id.
 */
async function resolveBookingDoctor(aiResult, patientId, doctors) {
    const requestedName = String(
        aiResult?.entities?.doctorName
        || aiResult?.toolCall?.params?.doctorName
        || ''
    ).toLowerCase().trim();

    if (requestedName && Array.isArray(doctors)) {
        const matched = doctors.find(d => String(d.name || '').toLowerCase().includes(requestedName));
        if (matched) return matched.id;
    }

    return resolveDoctorForPatient(patientId);
}

async function buildConversationHistory(patientId, phone) {
    try {
        const rawHistory = await whatsappRepository.getHistoryByPatient(patientId, phone);
        if (!Array.isArray(rawHistory) || rawHistory.length === 0) return [];
        return rawHistory.slice(-6).map(m => ({
            role: m.direction === 'inbound' ? 'paciente' : 'asistente',
            content: m.body || ''
        }));
    } catch (_histErr) {
        return [];
    }
}

async function processInboundMessage({ sender: _sender, message, patientId, phone }) {
    if (!patientId || !message || typeof message !== 'string') return null;

    try {
        const config = await aiConfigService.loadConfig(TENANT_ID);
        const doctors = await buildDoctors();
        const businessContext = aiConfigService.buildBusinessContext({
            config,
            doctors,
            currentTime: localTimeString()
        });

        const conversationHistory = await buildConversationHistory(patientId, phone);

        const payload = {
            tenantId: TENANT_ID,
            patientId: Number(patientId),
            phone: phone.startsWith('+') ? phone : `+${phone}`,
            message,
            systemConfig: config.systemConfig,
            conversationHistory,
            businessContext
        };

        let res = await axios.post(`${AI_SERVICE_URL}/api/v1/patient-message`, payload, {
            timeout: 15000,
            headers: { 'Content-Type': 'application/json' }
        });

        let aiResult = res.data;
        if (!aiResult) return null;

        // Sin motor de inferencia disponible: silencio hacia el paciente y registro.
        if (isInferenceUnavailable(aiResult)) {
            console.warn('[AI Microservice] INFERENCE_UNAVAILABLE', { patientId, latencyMs: aiResult.latencyMs });
            Sentry.captureMessage('INFERENCE_UNAVAILABLE', {
                level: 'warning',
                extra: { patientId, phone, latencyMs: aiResult.latencyMs }
            });
            return null;
        }

        console.log(`[AI Microservice] Intent: ${aiResult.intent} | Action: ${aiResult.actionRequired} | Conf: ${aiResult.confidence}`);

        // Orquestación en Backend: Si la IA solicita ejecutar una tool dinámica
        if (aiResult.actionRequired === 'CALL_TOOL' && aiResult.toolCall) {
            const { tool, params } = aiResult.toolCall;
            console.log(`[AI Microservice Orchestrator] Executing tool: ${tool} with params:`, params);

            let toolData = null;
            const targetDoctorName = params?.doctorName ? String(params.doctorName).toLowerCase() : '';
            const matchedDoc = doctors.find(d => targetDoctorName && d.name.toLowerCase().includes(targetDoctorName)) || doctors[0];

            if (tool === 'getDoctorSchedule' && matchedDoc) {
                const rawSchedules = await scheduleRepository.findByDoctor(matchedDoc.id);
                toolData = {
                    doctorId: matchedDoc.id,
                    doctorName: matchedDoc.name,
                    specialty: matchedDoc.specialty,
                    schedules: Array.isArray(rawSchedules) ? rawSchedules.filter(s => !s.is_break).map(s => ({
                        day: DAY_NAMES[s.day_of_week] || `Día ${s.day_of_week}`,
                        start: formatTime(s.start_time),
                        end: formatTime(s.end_time),
                        type: s.default_type === 'virtual' ? 'Virtual' : 'Presencial'
                    })) : []
                };
            } else if (tool === 'getDoctorAvailability' && matchedDoc) {
                const searchDate = params?.date ? formatDateOnlySQL(params.date) : new Date();
                const [availability, rawSchedules] = await Promise.all([
                    availabilitySearchService.getNextFreeSlot({
                        doctor_id: matchedDoc.id,
                        start_date: searchDate,
                        include_out_of_hours: 'false'
                    }),
                    scheduleRepository.findByDoctor(matchedDoc.id).catch(() => [])
                ]);

                // Mapa de day_of_week -> default_type para enriquecer cada slot con su modalidad
                const scheduleTypeByDay = {};
                (Array.isArray(rawSchedules) ? rawSchedules : [])
                    .filter(s => !s.is_break)
                    .forEach(s => {
                        scheduleTypeByDay[s.day_of_week] = s.default_type === 'virtual' ? 'Virtual' : 'Presencial';
                    });

                const enrichedResults = (availability?.results?.slice(0, 3) || []).map(r => {
                    // date en formato 'YYYY-MM-DD'
                    const [y, m, d] = (r.date || '').split('-').map(Number);
                    const dateObj = (y && m && d) ? new Date(y, m - 1, d) : new Date(r.date);
                    const dayOfWeek = dateObj.getDay();
                    const dayModality = scheduleTypeByDay[dayOfWeek] || 'Presencial';

                    return {
                        date: r.date,
                        dayName: r.dayName,
                        modality: dayModality,
                        slots: (r.slots || []).map(slot => ({
                            time: slot.time,
                            type: dayModality
                        }))
                    };
                });

                toolData = {
                    doctorId: matchedDoc.id,
                    doctorName: matchedDoc.name,
                    results: enrichedResults
                };
            }

            // Segunda pasada con el resultado de la herramienta inyectado
            const followUpPayload = {
                ...payload,
                toolResult: {
                    tool,
                    data: toolData
                }
            };

            const followUpRes = await axios.post(`${AI_SERVICE_URL}/api/v1/patient-message`, followUpPayload, {
                timeout: 15000,
                headers: { 'Content-Type': 'application/json' }
            });

            if (followUpRes.data && !isInferenceUnavailable(followUpRes.data)) {
                aiResult = followUpRes.data;
                console.log(`[AI Microservice Follow-Up] Intent: ${aiResult.intent} | Action: ${aiResult.actionRequired}`);
            } else if (isInferenceUnavailable(followUpRes.data)) {
                console.warn('[AI Microservice] INFERENCE_UNAVAILABLE on follow-up', { patientId });
                Sentry.captureMessage('INFERENCE_UNAVAILABLE', { level: 'warning', extra: { patientId, phone } });
                return null;
            }
        }

        // 1. Si el microservicio requiere crear una pre-reserva de turno
        let pendingBookingCreated = false;
        if (aiResult.actionRequired === 'CREATE_PENDING_BOOKING') {
            const doctorId = await resolveBookingDoctor(aiResult, patientId, doctors);
            if (!doctorId) {
                // Sin médico resoluble no se inventa un id: se registra y se responde lo sugerido.
                console.warn('[AI Microservice] No se pudo resolver médico para la pre-reserva', { patientId });
                Sentry.captureMessage('PENDING_BOOKING_WITHOUT_DOCTOR', { level: 'warning', extra: { patientId } });
            } else {
                const availability = await availabilitySearchService.getNextFreeSlot({
                    doctor_id: doctorId,
                    start_date: new Date(),
                    include_out_of_hours: 'false'
                });

                const dayGroup = availability?.results?.[0];
                const firstSlot = dayGroup?.slots?.[0];

                if (dayGroup?.date && firstSlot?.time) {
                    const pendingId = await pendingBookingRepository.create({
                        patient_id: patientId,
                        doctor_id: doctorId,
                        patient_phone: phone,
                        patient_message: message,
                        requested_slot_date: dayGroup.date,
                        requested_slot_time: firstSlot.time
                    });
                    pendingBookingCreated = true;
                    console.log(`[AI Microservice] ✅ Pending booking #${pendingId} created for patient ${patientId}`);
                }
            }
        }

        // 2. Si el microservicio generó una respuesta sugerida, despacharla al paciente
        // Si se requería crear una pre-reserva pero no hubo slot disponible ni médico resoluble,
        // no se envía una respuesta que afirme que el turno quedó agendado.
        if (aiResult.actionRequired === 'CREATE_PENDING_BOOKING' && !pendingBookingCreated) {
            console.warn('[AI Microservice] Pre-reserva requerida pero no creada; derivando a secretaría humana sin confirmar falsamente.', { patientId });
            const whatsappService = require('./whatsappService');
            await whatsappService.sendMessageDirect(
                phone,
                'Hemos recibido tu solicitud de turno. Una persona de secretaría revisará la agenda disponible y se comunicará a la brevedad para confirmar la opción.',
                patientId
            );
        } else if (aiResult.suggestedReply && aiResult.suggestedReply.trim()) {
            const whatsappService = require('./whatsappService');
            await whatsappService.sendMessageDirect(phone, aiResult.suggestedReply.trim(), patientId);
        }

        return aiResult;
    } catch (err) {
        console.error('[AI Microservice Error]:', err.response ? err.response.data : err.message);
        Sentry.captureException(err, { extra: { patientId, message, phone } });
        return null;
    }
}

/**
 * Consulta la disponibilidad del microservicio de IA según contrato OpenAPI (/health).
 * Retorna { status: 'ok', uptime: number } si está disponible, o null si falla.
 */
async function checkHealth() {
    try {
        const res = await axios.get(`${AI_SERVICE_URL}/health`, { timeout: 3000 });
        if (res.status === 200 && res.data?.status === 'ok') {
            return res.data;
        }
        return null;
    } catch (_err) {
        return null;
    }
}

/**
 * Sincroniza un documento de conocimiento con el microservicio RAG según contrato OpenAPI (/api/v1/knowledge/documents).
 * Retorna { status: 'indexed', documentId, chunksIndexed } o null si falla.
 */
async function syncKnowledgeDocument({ tenantId = TENANT_ID, documentId, title, content }) {
    if (!documentId || !title || !content) {
        return null;
    }
    try {
        const payload = {
            tenantId,
            documentId,
            title,
            content
        };
        const res = await axios.post(`${AI_SERVICE_URL}/api/v1/knowledge/documents`, payload, {
            timeout: 10000,
            headers: { 'Content-Type': 'application/json' }
        });
        if (res.status === 201 || res.status === 200) {
            return res.data;
        }
        return null;
    } catch (err) {
        console.warn('[AI Microservice] Error sincronizando documento RAG:', documentId, err.response?.data || err.message);
        return null;
    }
}

module.exports = {
    processInboundMessage,
    resolveDoctorForPatient,
    checkHealth,
    syncKnowledgeDocument
};
