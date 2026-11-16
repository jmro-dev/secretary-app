-- Migración 35: Configuración de IA e institución en system_settings
-- Deshardcodea los valores institucionales y los parámetros del motor de IA.
-- El microservicio edi3-ai-production es agnóstico: toda la configuración de
-- dominio (nombre, horario, reglas, intenciones, guardrails) vive aquí.
--
-- Se usa INSERT IGNORE para no sobrescribir valores ya editados desde el panel.

INSERT IGNORE INTO `system_settings` (`setting_key`, `setting_value`) VALUES
('clinic_name', 'Cima Salud Tandil'),
('secretary_hours', 'Lunes a Viernes hasta las 14:00 hs'),
('ai_system_role', 'Eres el asistente virtual oficial de atención por mensajería del consultorio.'),
('ai_operational_rules', 'No confirmes turnos definitivos: solo puedes registrar una solicitud pendiente (CREATE_PENDING_BOOKING).\nNunca emitas recetas, dosis ni indicaciones de medicación; deriva a la secretaría (plazo de 72 horas hábiles).\nAnte síntomas de emergencia (dolor de pecho, dificultad para respirar, desmayo), indica acudir a una guardia médica y llamar al 107/911.\nEl consultorio NO tiene convenio con obras sociales ni prepagas: todo se abona particular y se emite factura de honorarios para reintegro.\nLos aranceles y la disponibilidad solo pueden provenir del contexto provisto; nunca los inventes.\nEl horario de atención de secretaría se rige por la configuración vigente de la agenda.'),
('ai_allowed_intents', 'SOLICITUD_TURNO,CONSULTA_ARANCEL,CANCELACION_REPROGRAMACION,INFORMACION_HORARIOS,OTRO'),
('ai_emergency_terms', 'pecho,infarto,respirar,aire,desmayo,asfixia,coronario,brazo izquierdo,opresion'),
('ai_emergency_reply', 'Por los síntomas que describes, acudí de inmediato a una guardia médica o comunicate con el servicio de emergencias (107 / 911).'),
('ai_restricted_terms', 'clonazepam,rivotril,receta,medicamento,farmaco,ansiolitico,morfina,fentanilo'),
('ai_restricted_reply', 'La emisión o renovación de recetas requiere evaluación médica presencial o consulta programada. No se emiten recetas automáticas por WhatsApp.');
