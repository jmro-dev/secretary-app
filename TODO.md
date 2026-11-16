# 📋 TODO — Secretary-app

## 🛡️ Fixes de Seguridad y Rendimiento (Identificados en ramas de Jules)
- [ ] **Seguridad: Prevención de SQL Injection en `statsRepository`**
  - **Archivo:** `server/repositories/system/statsRepository.js` (métodos `getAppointmentSummaryStats` y `getAllTypesRequestAggregates`).
  - **Problema:** El parámetro `dateColumn` se interpola directamente en el template SQL (`r.${dateColumn} >= ?`).
  - **Acción:** Validar `dateColumn` contra una lista blanca permitida (`['appointment_date', 'created_at', 'updated_at']`) lanzando error si no coincide.
  - **Test:** Agregar suite en `server/repositories/__tests__/statsRepository.security.test.js`.

- [ ] **Rendimiento: Batching de consultas N+1 en `InstitutionService`**
  - **Archivo:** `server/services/core/institutionService.js` (método `getAllInstitutions`).
  - **Problema:** Bucle `for` ejecuta consultas individuales `phoneRepository.findByEntity` por cada institución.
  - **Acción:** Cargar los teléfonos en un solo batch mediante `phoneRepository.findByEntities('institution', ids)` agrupando por entidad.
  - **Test:** Suite de verificación en `server/services/core/institutionService.test.js`.

- [ ] **Bug: Desfase de Zona Horaria en `UserStatsService`**
  - **Archivo:** `server/services/system/userStatsService.js` (método `getStats`).
  - **Problema:** `d.toISOString().split('T')[0]` convierte fechas locales a UTC, causando desfase de 1 día hacia atrás en bordes horarios.
  - **Acción:** Implementar formateo directo en fecha local (`YYYY-MM-DD`) sin pasar por `.toISOString()`.
  - **Test:** Tests con mocks de zonas horarias en `server/services/system/userStatsService.test.js`.

- [ ] **Seguridad: Restricción de orígenes CORS en Express**
  - **Archivo:** `server/app.js`.
  - **Problema:** `app.use(cors())` utiliza comodín `*` permitiendo peticiones desde cualquier origen arbitrario.
  - **Acción:** Implementar whitelist de orígenes configurables vía variable de entorno `ALLOWED_ORIGINS` (con fallback a localhost/desarrollo y clientes internos).
  - **Test:** Validar middleware con orígenes autorizados y no autorizados en `server/tests/security/cors.test.js`.

---

## 🤖 Integración con Microservicio de IA (`edi3-ai-production`)
- [ ] **Desacoplar Lógica de IA Monolítica de WhatsApp:**
  - **Archivos:** `server/services/communication/whatsappAiBookingService.js` y `server/controllers/communication/whatsappController.js`.
  - **Problema:** Lógica de Gemini/Ollama acoplada en backend Express con prompts quemados en código y sin esquemas estrictos.
  - **Acción:** Reemplazar por cliente HTTP que despache el mensaje al microservicio `http://localhost:8000/api/v1/patient-message`.
  - **Payload Dinámico:** Inyectar `clinicContext` vivo desde MySQL (aranceles de `doctors`, horarios de `doctor_schedules` y reglas de `system_settings`).
  - **Historial Contextual (`conversationHistory`):** Enviar los últimos 5 mensajes del chat para resolución de correferencias y memoria de diálogo.
  - **Regla de Negocio:** La IA devuelve `suggestedReply` y `actionRequired` (`CREATE_PENDING_BOOKING`, etc.). Si se aprueba, la secretaria confirma desde el panel web (la IA jamás confirma turnos definitivos por su cuenta).
  - **Resiliencia:** Si el microservicio no responde o cae, degradar amablemente a notificación para respuesta manual de secretaría.

- [ ] **Frontend: Panel de Gestión de Base de Conocimiento RAG:**
  - **Archivo:** `client/src/features/whatsapp/WhatsappConfig.jsx` (o nueva pestaña en Configuración).
  - **Acción:** Crear vista con editor de texto enriquecido/Markdown para que la clínica edite sus políticas (obras sociales, preparación de estudios, plazos de recetas de 72 hs).
  - **Sincronización:** Al presionar "Guardar y Actualizar IA", guardar en MySQL y despachar `POST http://localhost:8000/api/v1/knowledge/documents` para alimentar el RAG en tiempo real sin reiniciar servidores.
  - **Contrato:** Enviar `{ tenantId: "cima-salud", documentId: "normativa-...", title: "...", content: "..." }`.

- [ ] **Monitoreo de Consumo y Métricas de IA en Panel Admin:**
  - **Archivo:** `client/src/features/dashboard/` o vista de Sistema.
  - **Acción:** Consumir `GET http://localhost:8000/metrics` para visualizar en tiempo real tokens consumidos (`tokensInEstimated`, `tokensOutEstimated`), costo acumulado estimado en USD y distribución de motor (`ollama`, `gemini`, `fallback`).

---

## 📱 Mobile (Expo Go)
- [ ] Verificar en el celular (con app recargada en Expo Go) que el modal de receta/certificado/licencia cargue la lista de doctores.
- [ ] Pestaña Archivos: solo lectura hoy; agregar botón para subir fotos/documentos desde el teléfono.
- [ ] Agregar test de controller para la rama `?doctorId=all` en `server/controllers/medical/medicalRequestController.js`.
