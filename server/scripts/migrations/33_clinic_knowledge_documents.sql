-- Migración 33: clinic_knowledge_documents (RAG dinámico institucional)
-- Permite gestionar normativas y políticas desde el panel web de la clínica
-- y sincronizarlas por API hacia el microservicio autónomo de IA (edi3-ai-production).

CREATE TABLE IF NOT EXISTS `clinic_knowledge_documents` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` VARCHAR(64) NOT NULL DEFAULT 'cima-salud',
  `document_id` VARCHAR(64) NOT NULL,
  `title` VARCHAR(200) NOT NULL,
  `content` MEDIUMTEXT NOT NULL,
  `category` VARCHAR(50) DEFAULT 'general',
  `is_active` TINYINT(1) DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_tenant_doc` (`tenant_id`, `document_id`),
  INDEX `idx_tenant_active` (`tenant_id`, `is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Semillado inicial con las normativas actuales de CIMA Salud Tandil
INSERT INTO `clinic_knowledge_documents` (`tenant_id`, `document_id`, `title`, `content`, `category`)
VALUES 
(
  'cima-salud',
  'aranceles_y_pagos',
  'Aranceles, Obras Sociales y Modalidades de Pago',
  'Normativa de cobertura y pagos de CIMA Salud:\n- Obras sociales y prepagas con convenio: IOMA, OSDE, Swiss Medical, Galeno, Federada Salud.\n- Consultas particulares: abonables por transferencia bancaria o en efectivo en secretaría.\n- Emisión de facturas B o C para reintegro en prepagas no convenidas con diagnóstico según CIE-10.',
  'aranceles'
),
(
  'cima-salud',
  'atencion_y_modalidades',
  'Modalidades de Atención y Pautas de Turnos',
  'Pautas para asignación de turnos:\n- Horario de atención presencial: Lunes a Viernes de 8:00 a 20:00 hs.\n- Los turnos no se confirman de forma inmediata; la secretaría valida disponibilidad y confirma vía WhatsApp.\n- En caso de requerir cancelación o reprogramación, se solicita avisar con al menos 24 horas de antelación.',
  'atencion'
),
(
  'cima-salud',
  'recetas_y_tramites',
  'Plazos y Solicitud de Recetas y Trámites Médicos',
  'Pautas para recetas y certificados:\n- La solicitud de renovación de recetas prolongadas se procesa en un plazo hábil de 48 a 72 horas.\n- Por disposiciones de salud pública, la prescripción de medicamentos controlados (psicofármacos) exige evaluación y firma médica; no se emiten automáticamente por mensajería.',
  'tramites'
)
ON DUPLICATE KEY UPDATE
  `title` = VALUES(`title`),
  `content` = VALUES(`content`),
  `category` = VALUES(`category`);
