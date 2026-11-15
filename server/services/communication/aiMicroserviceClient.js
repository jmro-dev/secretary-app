const axios = require('axios');
const Sentry = require('@sentry/node');
const doctorRepository = require('../../repositories/user/doctorRepository');
const scheduleRepository = require('../../repositories/appointments/scheduleRepository');
const appointmentRepository = require('../../repositories/appointments/appointmentRepository');
const pendingBookingRepository = require('../../repositories/communication/pendingBookingRepository');
const availabilitySearchService = require('../appointments/availabilitySearchService');
const whatsappRepository = require('../../repositories/communication/whatsappRepository');

const AI_SERVICE_URL = process.env.EDI3_AI_SERVICE_URL || 'http://127.0.0.1:8000';
const TENANT_ID = process.env.EDI3_TENANT_ID || 'cima-salud';

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function formatTime(timeStr) {
    if (!timeStr) return '';
    return timeStr.slice(0, 5);
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
    } catch (e) {
        return null;
    }
}

async function buildClinicContext() {
    try {
        const doctors = await doctorRepository.findAll();
        const mappedDoctors = [];

        if (Array.isArray(doctors)) {
            for (const d of doctors) {
                const docId = Number(d.id);
                let formattedSchedules = [];
                try {
                    const rawSchedules = await scheduleRepository.findByDoctor(docId);
                    if (Array.isArray(rawSchedules) && rawSchedules.length > 0) {
                        formattedSchedules = rawSchedules
                            .filter(s => !s.is_break)
                            .map(s => {
                                const dayName = DAY_NAMES[s.day_of_week] || `Día ${s.day_of_week}`;
                                const typeStr = s.default_type === 'virtual' ? ' (Virtual)' : ' (Presencial)';
                                return `${dayName} de ${formatTime(s.start_time)} a ${formatTime(s.end_time)}${typeStr}`;
                            });
                    }
                } catch (schedErr) {
                    // Si falla consulta de horarios, continuar con lista vacia
                }

                mappedDoctors.push({
                    id: docId,
                    name: d.full_name || `${d.first_name || ''} ${d.last_name || ''}`.trim(),
                    specialty: d.specialty || 'General',
                    consultationPrice: Math.max(Number(d.consultation_price || 0), 1000),
                    schedules: formattedSchedules
                });
            }
        }

        const now = new Date();
        const currentLocalTime = now.toLocaleDateString('es-AR', {
            timeZone: 'America/Argentina/Buenos_Aires',
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        return {
            clinicName: 'Cima Salud Tandil',
            currentTime: currentLocalTime,
            secretaryHours: 'Lunes a Viernes hasta las 14:00 hs',
            address: 'Montiel 1255, Tandil (entre Pellegrini y Montevideo)',
            doctors: mappedDoctors
        };
    } catch (e) {
        return {
            clinicName: 'Cima Salud Tandil',
            secretaryHours: 'Lunes a Viernes hasta las 14:00 hs',
            address: 'Montiel 1255, Tandil'
        };
    }
}

async function processInboundMessage({ sender: _sender, message, patientId, phone }) {
    if (!patientId || !message || typeof message !== 'string') return null;

    try {
        const clinicContext = await buildClinicContext();

        // Obtener historial conversacional reciente (últimos 6 mensajes)
        let conversationHistory = [];
        try {
            const rawHistory = await whatsappRepository.getHistoryByPatient(patientId, phone);
            if (Array.isArray(rawHistory) && rawHistory.length > 0) {
                // Tomar los últimos 6 mensajes previos
                const recent = rawHistory.slice(-6);
                conversationHistory = recent.map(m => ({
                    role: m.direction === 'inbound' ? 'paciente' : 'asistente',
                    content: m.body || ''
                }));
            }
        } catch (histErr) {
            // Continuar sin historial si falla
        }

        // Consultar al microservicio edi3-ai-production
        const payload = {
            tenantId: TENANT_ID,
            patientId: Number(patientId),
            phone: phone.startsWith('+') ? phone : `+${phone}`,
            message,
            conversationHistory,
            clinicContext
        };

        let res = await axios.post(`${AI_SERVICE_URL}/api/v1/patient-message`, payload, {
            timeout: 15000,
            headers: { 'Content-Type': 'application/json' }
        });

        let aiResult = res.data;
        if (!aiResult) return null;

        console.log(`[AI Microservice] Intent: ${aiResult.intent} | Action: ${aiResult.actionRequired} | Conf: ${aiResult.confidence}`);

        // Orquestación en Backend: Si la IA solicita ejecutar una tool dinámica
        if (aiResult.actionRequired === 'CALL_TOOL' && aiResult.toolCall) {
            const { tool, params } = aiResult.toolCall;
            console.log(`[AI Microservice Orchestrator] Executing tool: ${tool} with params:`, params);

            let toolData = null;
            const targetDoctorName = params?.doctorName ? params.doctorName.toLowerCase() : '';
            const allDoctors = clinicContext.doctors || [];
            const matchedDoc = allDoctors.find(d => targetDoctorName && d.name.toLowerCase().includes(targetDoctorName)) || allDoctors[0];

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
                const searchDate = params?.date ? new Date(params.date) : new Date();
                const availability = await availabilitySearchService.getNextFreeSlot({
                    doctor_id: matchedDoc.id,
                    start_date: searchDate,
                    include_out_of_hours: 'false'
                });
                toolData = {
                    doctorId: matchedDoc.id,
                    doctorName: matchedDoc.name,
                    results: availability?.results?.slice(0, 3) || []
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

            if (followUpRes.data) {
                aiResult = followUpRes.data;
                console.log(`[AI Microservice Follow-Up] Intent: ${aiResult.intent} | Action: ${aiResult.actionRequired}`);
            }
        }

        // 1. Si el microservicio requiere crear una pre-reserva de turno
        if (aiResult.actionRequired === 'CREATE_PENDING_BOOKING') {
            const doctorId = await resolveDoctorForPatient(patientId) || 10;
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
                console.log(`[AI Microservice] ✅ Pending booking #${pendingId} created for patient ${patientId}`);
            }
        }

        // 2. Si el microservicio generó una respuesta sugerida, despacharla al paciente
        if (aiResult.suggestedReply && aiResult.suggestedReply.trim()) {
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

module.exports = {
    processInboundMessage,
    resolveDoctorForPatient
};
