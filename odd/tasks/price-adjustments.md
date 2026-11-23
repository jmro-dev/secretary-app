# Ajuste de aranceles por inflación (#711)

Branch: `feat/711-price-adjustments` · Runner: `cd server && npx jest` · Delivery: work-unit commits on feature branch

## Specs

- **S1** — Redondeo centralizado en SQL: `fn_round_price(valor, paso)` devuelve `CEIL(valor / paso) * paso`. Todo precio resultante de un ajuste es múltiplo del paso configurado (por defecto 500).
- **S2** — Auditoría: tabla `price_changes` con una fila por celda modificada: `batch_id`, `scope` ('doctors'|'institutions'), `target_id`, `field`, `old_value`, `new_value`, `percent`, `rounding_step`, `inflation_source`, `inflation_period`, `user_id`, `changed_at`.
- **S3** — `proc_apply_price_increase(p_batch_id, p_percent, p_step, p_scope_doctors, p_scope_institutions, p_inflation_source, p_inflation_period, p_user_id)` aplica el aumento y audita en una sola transacción. Ante error hace ROLLBACK y propaga.
- **S4** — Inflación: `GET /api/finances/prices/inflation?since=YYYY-MM-DD` devuelve `{ percent, from, to, source, asOf, months }`. percent = `(IPC_hoy / IPC_since - 1) * 100`, ratio de índices, nunca suma de porcentajes.
- **S5** — Fuente primaria INDEC vía `https://apis.datos.gob.ar/series/api/series/?ids=148.3_INIVELNAL_DICI_M_26&limit=3&sort=desc`; fallback `https://api.argentinadatos.com/v1/finanzas/indices/inflacion`. Cache 6 h, timeout 5 s. Si ambas fallan se devuelve `{ available: false, reason }` con HTTP 200, nunca se rompe el flujo manual.
- **S6** — Preview de solo lectura: `GET /api/finances/prices/preview?percent=X&step=500&scope=doctors,institutions` devuelve filas `{ scope, targetId, field, oldValue, newValue }` sin escribir nada.
- **S7** — Aplicación: `POST /api/finances/prices/apply` con `{ percent, step, scope, batchId, inflationSource, inflationPeriod }`, protegido por `verifyToken` + `authorizePermission('can_crud_finances')`. Requiere `percent > -100`.
- **S8** — Migración idempotente `server/scripts/migrate-price-adjustments.js` y actualización de `server/01-schema.sql` para instalaciones nuevas.
- **S9** — Panel web: indicador de ajuste pendiente (≥ 90 días desde el último batch), preview y confirmación explícita.

## Tasks

| ID | Specs | Ruta | Estado |
|----|-------|------|--------|
| T1 | S1,S2,S3,S8 | inline | done (commit A) |
| T2 | S4,S5,S6,S7 | inline | pending |
| T3 | S9 | inline | pending |

## Log

**L1** (23/11/2026): "debemos pensar como gestionar aumentos en los precios de los aranceles . con redondeo ajustados por inflacion"

**L2** (23/11/2026) decisiones del usuario: alcance = aranceles de médicos + `institutions.base_price`; automatización = sugerir y confirmar; cadencia = trimestral; redondeo = múltiplo de 500 hacia arriba.

**L3** (23/11/2026): "si" → crear Issue #711 en Milestone "Aranceles e Inflación" e iniciar implementación.

**D1**: `transactions.amount` guarda el monto al cobro → historial inmutable; un aumento nunca recalcula el pasado.

**D2**: No existe sistema de migraciones; `scripts/setup.sh` solo carga `server/01-schema.sql` en base vacía. Se agrega script idempotente siguiendo el precedente `server/scripts/run-granular-migration.js`.

**D3**: `institutions.base_price` reemplaza al arancel del médico cuando la institución aplica → aumentar ambos no duplica impacto.

**D4**: `patients.tariff_override` fuera de alcance: queda congelado y se abarata en términos relativos. Aceptado explícitamente.

**D5**: Drift: redondeo sobre el valor vigente (estrategia A). Acotado a ±medio paso por ajuste y auditable.

**L4** (23/11/2026) revisión del hook de commit: se corrigieron idempotencia de `batch_id` (rechaza reaplicar), `percent DECIMAL(10,4)`, `field` como ENUM, `DEFINER` removido del dump y se agregaron tests.

**D6**: El test de integración detectó "Illegal mix of collations (utf8mb4_general_ci vs utf8mb4_unicode_ci)" al comparar `price_changes.batch_id` con el parámetro del procedimiento. Se fijó explícitamente `CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci` en la columna/parámetro y la tabla. Sin esto el procedimiento fallaba en toda instalación.

**V1** (evidence): `PRICE_ADJ_TEST_DB=test_clinical npx jest scripts/__tests__` → 7/7 verdes. `fn_round_price`: 23101→23500, 23500→23500, 70000→70000. Procedimiento con 12.5% sobre 23101→26000, 70000→79000, 45000→51000, 60000→67500. Guardas: `percent<=-100`, `batch_id` vacío y `batch_id` repetido rechazados. Precios restaurados tras el test.

