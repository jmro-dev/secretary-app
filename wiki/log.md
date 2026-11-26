# Wiki Log

## 2026-11-25

* **wikipoke-ingest "Raspberry Pi deployment"**: added the deployment flow and linked it from the architecture map; the current `main` production stack owns a separate database from legacy, while `development` uses its own MariaDB.
* **wikipoke-ingest (reconcile)**: reconciled 67 commits and 120 changed files since `658684f5`; added the quarterly price adjustment flow from implementation #712.
  - Re-verified debt lifecycle, appointment booking, and financial stored-procedure decision pages; the latter now records the transactional price-change routine.
  - Reconciled the pricing calculation and WhatsApp AI flow citations; added the price adjustment flow to the index and linked it from pricing.
  - Documented a UI/API mismatch: row-level edited prices are collected, but only the first row's price is sent as the apply override.

## 2026-11-20

* **Manual edit (targeted)**: updated the action vocabulary in [flows/whatsapp-ai-assistance.md](./flows/whatsapp-ai-assistance.md) after `#710` — `EXECUTE_ACTION` is the generic action, `CREATE_PENDING_BOOKING` remains valid for compatibility. The broader 36-commit drift reported by the hook is still pending a full `wikipoke-ingest` reconcile.

## 2026-11-16

* **wikipoke-ingest (reconcile)**: reconciled drift up to commit `48185ad7`.
  - Added [flows/whatsapp-ai-assistance.md](./flows/whatsapp-ai-assistance.md) documenting the stateless sidecar integration with `edi3-ai-production`, `aiConfigService` dynamic caching, sequential inbound queue, and human-in-the-loop invariants.
  - Reconciled stale citations in `concepts/debt-lifecycle.md`, `decisions/db-procedures-for-financial-invariants.md`, `flows/appointment-booking.md`, and `flows/price-calculation.md` following migration and schema additions (`clinic_knowledge_documents`).
  - Updated `architecture.md` and `index.md` linking the new WhatsApp AI flow.
  - Advanced checkpoint `.wikipoke-state.json` to `48185ad766e9270566eebd29958ad5215e57d536`.

## 2026-11-14

* **wikipoke-ingest (reconcile)**: reconciled drift up to commit `cffa5a1b`.
  - Re-verified citations and updated `sources_key` on `architecture.md`, `components/client.md`, and `components/server.md`.
  - Line anchors reconciled with Sentry global integrations and route additions.
  - Advanced checkpoint `.wikipoke-state.json` to `cffa5a1b`.

## 2026-10-27

* **wikipoke-ingest (seed)**: initial seed of Secretary App code wiki.
