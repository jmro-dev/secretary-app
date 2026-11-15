const axios = require('axios');
const Sentry = require('@sentry/node');
const doctorRepository = require('../../repositories/user/doctorRepository');
const appointmentRepository = require('../../repositories/appointments/appointmentRepository');
const pendingBookingRepository = require('../../repositories/communication/pendingBookingRepository');
const availabilitySearchService = require('../appointments/availabilitySearchService');

const AI_SERVICE_URL = process.env.EDI3_AI_SERVICE_URL || 'http://127.0.0.1:8000';
const TENANT_ID = process.env.EDI3_TENANT_ID || 'cima-salud';

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

async function processInboundMessage({ sender: _sender, message, patientId, phone }) {
    if (!patientId || !message || typeof message !== 'string') return null;

    try {
        // Consultar al microservicio edi3-ai-production
        const payload = {
            tenantId: TENANT_ID,
            patientId: Number(patientId),
            phone: phone.startsWith('+') ? phone : `+${phone}`,
            message
        };

        const res = await axios.post(`${AI_SERVICE_URL}/api/v1/patient-message`, payload, {
            timeout: 10000,
            headers: { 'Content-Type': 'application/json' }
        });

        const aiResult = res.data;
        if (!aiResult) return null;

        console.log(`[AI Microservice] Intent: ${aiResult.intent} | Action: ${aiResult.actionRequired} | Conf: ${aiResult.confidence}`);

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
