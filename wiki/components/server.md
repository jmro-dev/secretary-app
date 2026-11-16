---
title: Server Application
type: entity
responsibility: Express MVC backend providing REST APIs, authentication, and database orchestration.
sources:
  - server/app.js
synced: 658684f5
sources_key: 4677bec068cf
related:
  - ../architecture.md
  - ./client.md
  - ./whatsapp-bridge.md
generated: { by: antigravity/gemini-flash, at: 2026-10-27T05:07:00Z }
verified: { by: antigravity/gemini-flash, at: 2026-11-16T10:35:00Z }
---

# Server Application

The server is an Express.js backend providing REST endpoints for administrative, medical, and patient interactions.

## Responsibilities & Layers

- **Security & Middlewares**:
  - Global rate limiting configured on all incoming requests ([server/app.js:33](../../server/app.js#L33)).
  - Request logging with Morgan and custom sanitization via `safeJsonReplacer` ([server/app.js:48](../../server/app.js#L48)).
  - Background scheduler initialization ([server/app.js:56](../../server/app.js#L56)).
- **Doctor Context Resolution**:
  - Middleware intercepts `x-doctor-id` header to bind current doctor context to requests ([server/app.js:108](../../server/app.js#L108)).
- **Modular Routing**:
  - Authentication routes at `/api/auth` ([server/app.js:116](../../server/app.js#L116)).
  - Appointments at `/api/appointments` ([server/app.js:118](../../server/app.js#L118)).
  - Financial operations and accounts at `/api/finances` ([server/app.js:127](../../server/app.js#L127)).
  - WhatsApp webhook and interaction endpoints at `/api/whatsapp` ([server/app.js:121](../../server/app.js#L121)).
- **Centralized Error Handling**:
  - Global Express error handling middleware mounted at the end of the pipeline ([server/app.js:149](../../server/app.js#L149)).
