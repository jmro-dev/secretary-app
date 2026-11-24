POST http://localhost:4010/finances/prices/apply
Content-Type: application/json
```json
{
  "period": "2026-Q1",
  "basePrice": 70000,
  "suggestedPrice": 80000,
  "appliedPrice": 90000,
  "roundingStep": 500,
  "adjustmentReason": "Alta demanda de especialista",
  "source": "manual"
}
```
HTTP 200
[Asserts]
header "sl-violations" not exists
jsonpath "$.status" == "accepted_with_adjustment"
jsonpath "$.suggestedPrice" == 80000
jsonpath "$.appliedPrice" == 90000
jsonpath "$.delta" == 10000
jsonpath "$.deltaPct" == 12.5
jsonpath "$.adjustmentReason" == "Alta demanda de especialista"
jsonpath "$.source" == "manual"
