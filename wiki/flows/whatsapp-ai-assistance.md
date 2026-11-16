---
title: WhatsApp AI Assistance Flow
type: flow
responsibility: Inbound WhatsApp AI handling, dynamic context enrichment, sidecar coordination, and tool execution.
sources:
  - server/services/communication/aiMicroserviceClient.js
  - server/services/communication/aiConfigService.js
  - server/services/communication/whatsappService.js
synced: eaed1573
sources_key: cd262346ec2f
related:
  - ../architecture.md
  - ./appointment-booking.md
  - ../components/whatsapp-bridge.md
generated: { by: antigravity/gemini-flash, at: 2026-11-16T08:33:00Z }
verified: { by: antigravity/gemini-flash, at: 2026-11-16T10:35:00Z }
---

# WhatsApp AI Assistance Flow

Secretary App delegates clinical WhatsApp triage and conversational intelligence to an external autonomous sidecar (`edi3-ai-production` at `http://localhost:8000`).

## Architecture & Stateless Sidecar Pattern

1. **Relational State Ownership**:
   - `secretary-app` owns the database (MariaDB/MySQL).
   - The AI sidecar is stateless; `aiMicroserviceClient.js` injects real-time `systemConfig`, `businessContext`, and conversation history on every request ([server/services/communication/aiMicroserviceClient.js:235-245](../../server/services/communication/aiMicroserviceClient.js#L235-L245)).
2. **Dynamic Configuration Cache**:
   - `aiConfigService.js` retrieves `system_settings` and active `clinic_knowledge_documents`, caching the compiled context for 60 seconds ([server/services/communication/aiConfigService.js:130-145](../../server/services/communication/aiConfigService.js#L130-L145)).

## Execution Sequence

```
Patient WhatsApp Message
       │
       ▼
WhatsApp Bridge (Go) ──► whatsappService.js (Sequential phone queue)
                               │
                               ▼
                    aiMicroserviceClient.processInboundMessage()
                               │
                ┌──────────────┴──────────────┐
                ▼                             ▼
       aiConfigService (cache)     doctorRepository / availability
                │                             │
                └──────────────┬──────────────┘
                               ▼
               POST /whatsapp/ai-suggestion (Sidecar)
                               │
             ┌─────────────────┴─────────────────┐
             ▼                                   ▼
    Action: CALL_TOOL                     Action: REPLY
             │                                   │
   Execute local tool                     Send WhatsApp text
(e.g., search_slots, create_pending)      (Human-in-the-loop)
```

## Critical Guardrails and Invariants

1. **Human-in-the-Loop Booking**:
   - The AI **never confirms appointments directly**.
   - Scheduling actions generate a `pending_bookings` record (`CREATE_PENDING_BOOKING`) awaiting manual verification by clinic receptionists.
2. **Zero Automated Prescriptions**:
   - In accordance with medical governance, medical prescriptions cannot be authorized over WhatsApp chat. Requests are dispatched to the medical queue with a standard turnaround of up to 72 business hours.
3. **Sequential Inbound Queue**:
   - Webhook processing uses an in-memory sequential promise chain keyed by phone number (`whatsappService.js`), eliminating race conditions from bursts of rapid messages.
