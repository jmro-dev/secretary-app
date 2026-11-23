# Diseño de migración MySQL — ajustes de arancel

**Estado: ejecutado en producción el 2026-11-23.** La migración base creó `price_changes`, `fn_round_price` y `proc_apply_price_increase`; la migración del ledger creó las cuatro tablas nuevas y agregó las tres columnas de compatibilidad. El backfill no insertó filas porque no había historial previo. La cadencia de evaluación permanece **trimestral** (`odd/tasks/price-adjustments.md:29`, L2); el cierre anual se incorpora como un **confronte interanual adicional**, no como reemplazo de la evaluación trimestral.

## 2. Objetivo y alcance

| Objetivo | Decisión de diseño |
|---|---|
| Evaluación trimestral | Persistir `period` con formato `YYYY-QN` y los factores compuestos por periodo. |
| Cierre anual adicional | `price_closing_summaries` resume `inflationYoY`, `appliedCumulative`, `margin` y `verdict` por año. |
| Doble registro (*dual ledger*) | `price_changes` sigue siendo la auditoría de compatibilidad del valor aplicado; `price_adjustment_ledger` registra sugerencia y valor aplicado lado a lado, con `delta`, `deltaPct`, `adjustmentReason`, `source` y `status`. |
| Avisos de variación | `price_variation_notices` conserva el precio cotizado y el precio vigente para detectar diferencias dentro de la ventana de 7 días. |

**Fuera de alcance:** `patients.tariff_override` (`server/01-schema.sql:694-695`, decisión D4 en `odd/tasks/price-adjustments.md:39`), `transactions.amount` (`server/01-schema.sql:933`, decisión D1 en `odd/tasks/price-adjustments.md:33`) y `appointments.cost` (`server/01-schema.sql:52`). Ninguna migración recalcula esos valores históricos.

## 3. Estado actual reutilizable

| Recurso | Evidencia | Uso en la propuesta |
|---|---|---|
| Precios vigentes | `doctors` en `server/01-schema.sql:233-240`; `institutions.base_price` en `:298` | Únicas celdas ajustables. |
| Cálculo de precio final | `fn_calculate_service_price` en `server/01-schema.sql:1471-1525` | Confirma que institución, `tariff_percent` y `tariff_override` intervienen en el cargo; por eso quedan fuera del ajuste. |
| Redondeo comercial | `fn_round_price` en `server/01-schema.sql:2909` (`CEIL`) | Se reutiliza para reconstruir la sugerencia en el backfill. |
| Auditoría actual | `price_changes` en `server/01-schema.sql:2816`, `uk_batch_target_field` en `:2834` | Se conserva intacta; el ledger nuevo agrega las dos vías de comparación. |
| Aplicación atómica | `proc_apply_price_increase` en `server/01-schema.sql:2928`: 8 parámetros, guarda de replay en `:2961`, `EXIT HANDLER` con `ROLLBACK`/`RESIGNAL` en `:2942`, `COMMIT` en `:3054` | Patrón transaccional preservado. |
| Precedente de migración | `server/scripts/run-granular-migration.js:1-74`; `server/scripts/migrate-price-adjustments.js:16-21` | Modelo de idempotencia y de `CREATE IF NOT EXISTS` más recreación de rutinas. |
| Servicio actual | `server/services/finance/priceAdjustmentService.js:60-168`, `:181-211`, `:217-295`, `:301-349` | Envía `inflationSource || 'manual'` e `inflationPeriod || null` en `:327-328`; no persiste `reason`, `status` ni `period`. |
| Contrato | `docs/specs/openapi.yaml`: `period`, factores, precios, `delta`, `deltaPct`, `adjustmentReason`, `source`, `status`, `ClosingSummary` y `PriceVariationNotice` | Define los campos que debe conservar el esquema. |
| Colación | D6 en `odd/tasks/price-adjustments.md:45` | Toda columna `CHAR` comparada con parámetros declara explícitamente `utf8mb4_unicode_ci`. |

## 4. Cambios propuestos

Convención: los cuatro objetos nuevos usan `ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`. Las longitudes decimales siguen el contrato: factores `DECIMAL(10,4)`, precios y deltas `DECIMAL(12,2)`, `delta_pct DECIMAL(6,3)`.

```sql
CREATE TABLE IF NOT EXISTS price_adjustment_periods (
  period CHAR(7) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  year SMALLINT NOT NULL,
  quarter TINYINT NOT NULL,
  inflation_factor DECIMAL(10,4) NOT NULL,
  effective_factor DECIMAL(10,4) NOT NULL,
  PRIMARY KEY (period),
  KEY idx_year (year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

```sql
CREATE TABLE IF NOT EXISTS price_adjustment_ledger (
  id BIGINT NOT NULL AUTO_INCREMENT,
  batch_id CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  period CHAR(7) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  scope ENUM('doctors','institutions') NOT NULL,
  target_id INT NOT NULL,
  field ENUM('consultation_price','prescription_price','medical_license_price','certificate_price','virtual_consultation_price','base_price') NOT NULL,
  base_price DECIMAL(12,2) NOT NULL,
  inflation_factor DECIMAL(10,4) NOT NULL,
  effective_factor DECIMAL(10,4) NOT NULL,
  applied_factor DECIMAL(10,4) NOT NULL,
  suggested_price DECIMAL(12,2) NOT NULL,
  applied_price DECIMAL(12,2) NOT NULL,
  delta DECIMAL(12,2) NOT NULL,
  delta_pct DECIMAL(6,3) NOT NULL,
  rounding_step INT NOT NULL,
  adjustment_reason VARCHAR(255) NOT NULL,
  source ENUM('auto','manual') NOT NULL,
  status ENUM('accepted','accepted_with_adjustment') NOT NULL,
  user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_ledger_batch_target_field (batch_id, scope, target_id, field),
  KEY idx_ledger_period (period),
  KEY idx_ledger_period_target (period, scope, target_id, field),
  KEY idx_ledger_target (scope, target_id, field),
  KEY idx_ledger_batch (batch_id),
  CONSTRAINT fk_ledger_period FOREIGN KEY (period) REFERENCES price_adjustment_periods (period)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

```sql
CREATE TABLE IF NOT EXISTS price_closing_summaries (
  year SMALLINT NOT NULL,
  inflation_yoy DECIMAL(10,4) NOT NULL,
  applied_cumulative DECIMAL(10,4) NOT NULL,
  margin DECIMAL(10,4) NOT NULL,
  verdict ENUM('cheaper','expensive','aligned') NOT NULL,
  PRIMARY KEY (year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

```sql
CREATE TABLE IF NOT EXISTS price_variation_notices (
  id BIGINT NOT NULL AUTO_INCREMENT,
  appointment_id INT NOT NULL,
  booking_reference VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  quoted_price DECIMAL(12,2) NOT NULL,
  current_price DECIMAL(12,2) NOT NULL,
  delta DECIMAL(12,2) NOT NULL,
  days_before TINYINT NOT NULL,
  notified_at DATETIME NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_notice_appointment_quoted (appointment_id, quoted_price),
  KEY idx_notice_window (days_before, notified_at),
  CONSTRAINT fk_notice_appointment FOREIGN KEY (appointment_id) REFERENCES appointments (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

`bookingId` del contrato se deriva de `booking_reference`; `appointmentAt` se obtiene de `appointments.appointment_date` (`server/01-schema.sql:48`). No se agrega `booking_reference` a `appointments`: su origen requiere confirmación humana.

**ALTER opcional y retrocompatible sobre `price_changes`.** Solo se ejecuta si `information_schema.COLUMNS` indica que la columna falta; no hay `DROP`, `RENAME` ni cambio de tipos. `price_changes` se conserva para compatibilidad con los consumidores actuales.

```sql
ALTER TABLE price_changes ADD COLUMN source ENUM('auto','manual') NULL AFTER inflation_source;
ALTER TABLE price_changes ADD COLUMN adjustment_reason VARCHAR(255) NULL AFTER source;
ALTER TABLE price_changes ADD COLUMN status ENUM('accepted','accepted_with_adjustment') NULL AFTER adjustment_reason;
```

El orden de las sentencias garantiza que cada columna de referencia exista antes de su uso en `AFTER`. El backfill no inventa valores para las filas históricas con `NULL`.

## 5. Plan de migración idempotente

Seguir `server/scripts/run-granular-migration.js:1-74`: `await dbReady`, `pool.getConnection()`, sondeos en `information_schema` con `TABLE_SCHEMA = DATABASE()`, `console.log` por cada objeto, `try/catch/finally` con `conn.release()`, `pool.end()` y `process.exitCode = 1` en caso de error.

| Orden | Acción | Comprobación previa |
|---|---|---|
| 1. Esquema | `CREATE TABLE IF NOT EXISTS` para las cuatro tablas; `ALTER TABLE ... ADD COLUMN` solo para columnas ausentes de `price_changes`. | `information_schema.TABLES` y `information_schema.COLUMNS`. |
| 2. Backfill | Poblar periodos y ledger desde `price_changes`, sin modificar precios vigentes. | Reglas de la sección 6. |
| 3. Índices | Verificar `information_schema.STATISTICS` y crear solo los índices faltantes en tablas preexistentes; `CREATE TABLE IF NOT EXISTS` no repara índices ausentes. | Nombre de tabla, índice y columnas. |
| 4. Rutinas | Crear la rutina nueva de doble registro dentro de una transacción, conservando la firma de 8 parámetros de `proc_apply_price_increase` para los llamadores actuales. Mantener guarda de replay, `EXIT HANDLER` y `COMMIT`. | `information_schema.ROUTINES`; `DROP`/`CREATE` solo tras confirmación. |
| 5. Servicio, rutas y tests | Persistir `period`, `reason`, `source` y `status`; mapear respuestas al contrato; ejecutar Hurl y Jest. | `openapi.yaml` y tests existentes. |

El espejo en `server/01-schema.sql` quedó consolidado en un único bloque vigente (`server/01-schema.sql:2811-3055`); el bloque duplicado anterior fue eliminado.

## 6. Reglas de backfill desde `price_changes` y límites

- No crear nuevos `batch_id`. Cada fila del ledger se origina en un `batch_id` existente; la unicidad `(batch_id, scope, target_id, field)` y la guarda de replay impiden duplicados.
- Solo reconstruir filas con `percent` y `rounding_step` no nulos. Sugerencia: `fn_round_price(old_value * (1 + percent / 100), rounding_step)`.
- Factores: `inflation_factor = 1 + percent / 100`; `effective_factor = suggested_price / base_price`; `applied_factor = new_value / base_price`. La acumulación por periodo es producto de factores, nunca suma de porcentajes.
- `base_price = old_value`, `suggested_price` según la fórmula anterior, `applied_price = new_value`, `delta = applied_price - suggested_price`, `delta_pct = 100 * delta / suggested_price` y `status = 'accepted'` si `delta = 0`, si no `'accepted_with_adjustment'`.
- `period` solo si `inflation_period` coincide con `YYYY-QN`; `year` y `quarter` se derivan de esa cadena. Los demás valores se informan para revisión manual, sin inventar periodos.
- No derivar `price_closing_summaries` de forma automática: el confronte interanual depende de una definición humana de extremos y de `verdict`.
- No poblar `price_variation_notices` desde `transactions` ni desde `appointments.cost`: hoy no existe un snapshot fiable del precio cotizado y su captura requiere un cambio de código.
- Ninguna regla ejecuta `UPDATE` sobre `doctors`, `institutions`, `patients`, `transactions` ni `appointments`.

## 7. Riesgos y confirmaciones humanas requeridas

- [x] DDL: crear cuatro tablas y los tres `ALTER` opcionales. Confirmación humana recibida; backup lógico previo en `/tmp/clinical_management_before_price_adjustments.sql`.
- [x] Reemplazo de routines: se conservó la firma de 8 parámetros de `proc_apply_price_increase` y se recrearon `fn_round_price` y el procedimiento desde `server/scripts/migrate-price-adjustments.js`.
- [ ] Semántica de `verdict`: se propone `margin = appliedCumulative - inflationYoY`; con `0.45`, `0.40` y `-0.05`, el ejemplo de `docs/specs/openapi.yaml:93-98` indica `cheaper`. Confirmar el umbral de `aligned` y el signo de `expensive`.
- [ ] Política de avisos: ventana de 7 días, origen de `booking_reference` (no existe en `appointments`), cálculo de `days_before`, canal de notificación y quién registra `notified_at`. No enviar avisos automáticamente sin confirmación.
- [x] Reglas de backfill: ejecutadas con las guardas de la sección 6; no se insertaron filas porque `price_changes` estaba vacía.
- [x] Duplicados de `server/01-schema.sql`: se eliminó el bloque anterior y quedó una sola definición vigente.
- [x] Colación D6: `utf8mb4_unicode_ci` explícito en `batch_id`, `period`, `booking_reference` y parámetros de rutinas, según `odd/tasks/price-adjustments.md:45`.
- [x] Cadencia: el cierre anual es adicional y la evaluación trimestral original no se eliminó.

## 8. Criterios de aceptación verificables

- [ ] Ejecutar el script dos veces: la segunda pasada informa que los objetos ya existen y no genera filas duplicadas.
- [ ] Un `batch_id` repetido con la misma combinación `scope`, `target_id` y `field` es rechazado por `uk_ledger_batch_target_field`; un aviso repetido para el mismo `appointment_id` y `quoted_price` es rechazado por `uk_notice_appointment_quoted`.
- [ ] Los factores se comprueban compuestos: `1.02 * 1.02 = 1.0404`, no `1.04`; el factor real respeta el redondeo, por ejemplo `70000 -> 72000` da `1.02857`, no `1.03`.
- [ ] El caso de doble registro `80000 -> 90000` guarda `delta = 10000`, `deltaPct = 12.5`, `status = 'accepted_with_adjustment'` y `source = 'manual'`, coincidiendo con `docs/specs/openapi.yaml:282-289`.
- [ ] Un turno dentro de los 7 días con `quotedPrice = 70000` y `currentPrice = 80000` expone `delta = 10000`, `daysBefore = 7` y `notifiedAt = null`, según `docs/specs/hurl/due-price-notices.hurl`.
- [ ] Los tests Hurl de `docs/specs/hurl/` y la suite Jest relevante pasan; el backfill no altera `transactions.amount`, `appointments.cost` ni `patients.tariff_override`.
