<!-- wikipoke:start · managed by wikipoke: `wikipoke hooks remove agents` takes this block out -->
## Code wiki

This repository keeps a code wiki in `wiki/`, maintained with the skills in `.agents/skills/`:
`wikipoke-ingest` updates it, `wikipoke-query` answers from it, `wikipoke-lint` reviews it. At
the start of a session, run `sh wiki/.wikipoke-hook.sh` and act on what it prints; it is silent
when the wiki is current.
<!-- wikipoke:end -->

---

# Reglas de Gobernanza y Directivas de Desarrollo — Secretary App

Este repositorio es la aplicación central de gestión médica, turnos, pacientes y secretaría clínica (CIMA Salud Tandil).
Todos los agentes de IA y desarrolladores deben cumplir estrictamente las reglas globales del sistema (`/home/jmro/AGENTS.md`) y las pautas locales de este proyecto.

---

## 1. REGLA DE ORO: Clarificación Previa Obligatoria
> **NUNCA ejecutar acciones masivas, refactors o descargas sin formular antes las preguntas mínimas necesarias al usuario.**
- En tareas ambiguas: clarificar alcance, impacto en base de datos (MySQL/Prisma) y componentes afectados antes de modificar código.

---

## 2. Gobernanza de Tareas en GitHub (Issues & Milestones Obligatorios)
- **Requisito Previo Obligatorio:** Antes de escribir una sola línea de código, crear o vincular formalmente un Issue en GitHub asignado a su Milestone correspondiente.
- **Trazabilidad en Commits:** Todo commit debe referenciar el Issue que resuelve (ej: `fix(stats): prevenir SQL injection en statsRepository (resolves #12)`).
- **Cierre Formal:** Al verificar con tests unitarios y auditorías, el Issue se cierra y se refleja el avance en el Milestone y en el tablero Daily Board.

---

## 3. Arquitectura y Desacople de IA (Sidecar `edi3-ai-production`)
- **Microservicio Externo de IA:** Toda lógica conversacional de WhatsApp, RAG, clasificación de intenciones y análisis de mensajes pertenece al microservicio autónomo `http://localhost:8000`.
- **Stateless AI:** `secretary-app` es la **dueña del estado relacional** (MySQL). Es responsable de inyectar `clinicContext` en vivo (doctores, aranceles, próximos turnos) y los últimos mensajes en `conversationHistory`.
- **Human-in-the-Loop Obligatorio:**
  - La IA **NUNCA confirma turnos definitivos** automáticamente por WhatsApp.
  - La IA únicamente genera solicitudes en `pending_bookings` (`actionRequired: 'CREATE_PENDING_BOOKING'`) para que la secretaria humana revise y confirme desde el panel web.
- **Invariante de Prescripción Cero:** Prohibido emitir o autorizar recetas automáticamente por chat. Los pedidos de recetas van a la bandeja de pendientes médicas con plazo de hasta 72 hs hábiles.

---

## 4. Filosofía Linus Torvalds (KISS & Good Taste)
- **Data Structures First:** Diseñar estructuras de datos claras para que los casos especiales desaparezcan.
- **KISS (Keep It Simple, Stupid):** Sin frameworks monstruosos ni sobreingeniería para tareas que se resuelven con consultas limpias y funciones directas.
- **Never Break Userspace:** Respetar los contratos de API existentes de Express y los flujos activos del panel web y la app móvil (Expo Go).
- **Seguridad en Backend:** 
  - Prevención de SQL Injection mediante parámetros preparados (prohibido concatenar columnas en templates SQL).
  - Whitelist estricta de orígenes CORS.
  - Formateo de fechas locales en `YYYY-MM-DD` sin desfase UTC de `.toISOString()`.

---

## 5. Pipeline de Software Factory (Roles)
1. **Spec Writer:** Definición de la tarea, contrato y criterios de aceptación.
2. **Builder:** Implementación atómica con tests de verificación (`npm test`).
3. **Auditores:** 
   - Código (`linus-torvalds`).
   - UI/UX (`impeccable`).
   - Seguridad y Fuzzing (`adversarial-testing` - Breaker).
4. **Approver:**
   - Si el cambio es menor/test: habilitado para commit y PR.
   - Si el cambio toca Auth, Esquema MySQL, Pagos o APIs externas: **requiere confirmación humana obligatoria**.
