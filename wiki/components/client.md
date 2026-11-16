---
title: Web Client
type: entity
responsibility: React 19 single-page application with atomic design, CSS modules, and context providers.
sources:
  - client/src/main.jsx
synced: cffa5a1b6823e7e742060829f33511f480b72f3b
sources_key: f3b49c1e67ac
related:
  - ../architecture.md
  - ./server.md
generated: { by: antigravity/gemini-flash, at: 2026-10-27T05:07:00Z }
verified: { by: antigravity/gemini-flash, at: 2026-11-14T23:18:00Z }
---

# Web Client

The web client provides the main administrative and clinical interface for secretaries and physicians.

## Entry Point and Context Stack

The application mounts on `#root` wrapped in React StrictMode and React Router ([client/src/main.jsx:36](../../client/src/main.jsx#L36)).

Global state is organized across modular context providers ([client/src/main.jsx:39-46](../../client/src/main.jsx#L39-L46)):
- `AuthProvider`: Session and user credential state.
- `LanguageProvider`: Internationalization helper and active dictionary.
- `MessageProvider`: Toast and user notification system.
- `ConfigProvider`: Workspace and environment settings.
- `DoctorProvider`: Active doctor filter context for multi-practitioner offices.
- `SearchProvider`: Global search suggestions and query states.
- `ModalProvider`: Dynamic modal dialog coordinator.

Global CSS variables and design tokens are declared in `client/src/index.css` ([client/src/main.jsx:26](../../client/src/main.jsx#L26)), while all UI components enforce scoped CSS modules.
