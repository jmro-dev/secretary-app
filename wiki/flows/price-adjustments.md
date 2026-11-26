---
title: Quarterly Price Adjustment Flow
type: flow
responsibility: Human-reviewed inflation adjustments to doctor and institution tariffs, with batch audit and historical ledger.
sources:
  - client/src/features/finances/FinancesPage.jsx
  - client/src/features/finances/components/modals/PriceAdjustmentModal.jsx
  - server/routes/finance/financeRoutes.js
  - server/controllers/finance/financeController.js
  - server/services/finance/priceAdjustmentService.js
  - server/01-schema.sql
  - server/scripts/migrate-price-adjustments.js
  - server/scripts/migrate-price-adjustments-ledger.js
synced: 41f85285
sources_key: 7319171ec88d
confidence: high
related:
  - ./price-calculation.md
  - ../decisions/db-procedures-for-financial-invariants.md
generated: { by: codex/gpt-6, at: 2026-11-25T16:16:00Z }
---

# Quarterly Price Adjustment Flow

Finance staff can review an inflation-based suggestion, preview its effect, and apply a selected adjustment batch. The normal pricing function still resolves the tariff for an appointment; this flow changes the configured tariffs used by future calculations.

## Review and apply

1. The finance page opens the adjustment modal and loads the last adjustment status before requesting inflation data ([FinancesPage.jsx:79-94](../../client/src/features/finances/FinancesPage.jsx#L79), [PriceAdjustmentModal.jsx:54-72](../../client/src/features/finances/components/modals/PriceAdjustmentModal.jsx#L54)). The status marks an adjustment pending after 90 days; inflation comes first from INDEC and falls back to ArgentinaDatos, with successful responses cached for six hours ([priceAdjustmentService.js:121-173](../../server/services/finance/priceAdjustmentService.js#L121), [priceAdjustmentService.js:180-234](../../server/services/finance/priceAdjustmentService.js#L180)).
2. The operator chooses the period, percentage, rounding step, and whether doctor or institution tariffs are in scope. Preview includes positive doctor tariffs across consultation, prescription, license, certificate and virtual consultation, plus institution base prices; rounding uses `CEIL(value / step) * step` ([PriceAdjustmentModal.jsx:104-142](../../client/src/features/finances/components/modals/PriceAdjustmentModal.jsx#L104), [priceAdjustmentService.js:280-363](../../server/services/finance/priceAdjustmentService.js#L280)).
3. Applying requires a preview and at least one scope. The authenticated `POST /prices/apply` route additionally requires `can_crud_finances`; the controller records the acting user and logs the applied batch ([financeRoutes.js:20-27](../../server/routes/finance/financeRoutes.js#L20), [financeController.js:224-255](../../server/controllers/finance/financeController.js#L224)).
4. MySQL applies the selected scopes and records old and new values in `price_changes` within the stored procedure's transaction. The batch ID prevents reapplication, and the procedure rolls back on SQL errors ([server/01-schema.sql:2921-2956](../../server/01-schema.sql#L2921)). After that atomic update, the service writes the quarterly ledger and refreshes notices for upcoming appointments as best-effort work; failure there is logged while the successful price change remains recorded ([priceAdjustmentService.js:388-480](../../server/services/finance/priceAdjustmentService.js#L388)).

## Boundaries and migration

Patient-specific `tariff_override` values and past transactions are not changed by the adjustment. The modal exposes editable values for each preview row, but its apply request sends only the first row's edited price as the procedure's single `appliedPrice` override; therefore edits to later rows do not reach the database ([PriceAdjustmentModal.jsx:168-207](../../client/src/features/finances/components/modals/PriceAdjustmentModal.jsx#L168), [server/01-schema.sql:2954-2956](../../server/01-schema.sql#L2954)). This is a mismatch between the row-level UI and the current apply contract.

Existing databases receive the base price-adjustment table, function and procedure from `migrate-price-adjustments.js`; `migrate-price-adjustments-ledger.js` ensures ledger tables/indexes and backfills periods and ledger rows from prior batches ([migrate-price-adjustments.js:210-230](../../server/scripts/migrate-price-adjustments.js#L210), [migrate-price-adjustments-ledger.js:313-340](../../server/scripts/migrate-price-adjustments-ledger.js#L313)).
