-- Migración 34: Sincronización canónica de clinic_knowledge_documents
-- Corrige el seed de la migración 33 para que la BD coincida con los documentos
-- canónicos versionados en server/knowledge/*.md.
--
-- Verdades de negocio confirmadas:
--   1. Aranceles: el consultorio NO tiene convenio directo con obras sociales ni
--      prepagas. Todo se abona particular y se emite factura para reintegro. La
--      obra social del paciente es solo a fines estadísticos.
--   2. Horario de secretaría: se rige por la configuración vigente de la app
--      (no es un valor fijo en la normativa).
--   3. Recetas: plazo de 72 horas hábiles.

INSERT INTO `clinic_knowledge_documents` (`tenant_id`, `document_id`, `title`, `content`, `category`)
VALUES
(
  'cima-salud',
  'aranceles_y_pagos',
  'Aranceles, Facturación y Medios de Pago',
  '# Aranceles, Facturación y Medios de Pago\n\n## Obras Sociales y Reintegros\n- El consultorio **NO tiene convenio directo con obras sociales ni prepagas**.\n- Todas las consultas se abonan de forma particular.\n- Se emite **factura oficial de honorarios médicos** para que el paciente pueda presentarla ante su obra social o medicina prepaga y gestionar el reintegro.\n- La obra social cargada en el paciente es **solo a fines estadísticos**; no implica convenio ni cobertura.\n\n## Medios de Pago Aceptados\n- **Contado efectivo**.\n- **Tarjeta de débito**.\n- **Transferencia bancaria**.\n- **Mercado Pago**.',
  'aranceles'
),
(
  'cima-salud',
  'atencion_y_modalidades',
  'Ubicación, Horarios y Modalidades de Atención',
  '# Ubicación, Horarios y Modalidades de Atención\n\n## Nombre del Consultorio y Ubicación\n- **Centro**: Cima Salud Tandil.\n- **Dirección**: Montiel 1255, Tandil (entre Pellegrini y Montevideo).\n\n## Horario de Atención de Secretaría\n- El horario de atención y coordinación de la secretaría se rige por la **configuración vigente de la agenda** de la aplicación; no es un valor fijo en esta normativa.\n\n## Especialidad y Modalidades\n- **Especialidad**: Psiquiatría.\n- **Modalidades de atención**:\n  - **Presencial**: en el consultorio (Montiel 1255, Tandil).\n  - **Virtual**: mediante videollamada.\n\n## Gestión de Turnos y Anticipación\n- La agenda médica se encuentra **muy solicitada**, por lo que los turnos deben programarse con **amplia anticipación**, nunca sobre la fecha.\n- Se confirma la asistencia de forma obligatoria para resguardar el cupo reservado.\n\n## Urgencias, Emergencias y Sobreturns\n- En casos de **emergencia real**, la solicitud recibe prioridad.\n- Todo sobreturno o atención de urgencia está **estrictamente sujeto a evaluación y criterio clínico conjunto de la doctora y la secretaría**.\n- La secretaría administra la agenda y determina la posibilidad de sobreturnos; no constituye una regla fija ni automática.',
  'atencion'
),
(
  'cima-salud',
  'recetas_y_tramites',
  'Solicitud de Recetas y Trámites Médicos',
  '# Solicitud de Recetas y Trámites Médicos\n\n## Plazos para Emisión de Recetas\n- Toda solicitud de recetas médicas requiere un plazo de **72 horas hábiles** desde la solicitud hasta que se encuentra lista y firmada por la profesional.\n- Es indispensable solicitar la medicación habitual con la debida antelación para asegurar la continuidad del tratamiento.\n\n## Proceso de Solicitud\n- Las recetas se gestionan a través del canal de secretaría, indicando: nombre completo, DNI, medicación solicitada y dosis habitual.',
  'tramites'
)
ON DUPLICATE KEY UPDATE
  `title` = VALUES(`title`),
  `content` = VALUES(`content`),
  `category` = VALUES(`category`);
