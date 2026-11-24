GET http://localhost:4010/finances/prices/ledger?year=2026
HTTP 200
[Asserts]
header "sl-violations" not exists
jsonpath "$[0].period" == "2026-Q1"
jsonpath "$[0].inflationFactor" == 1.142857
jsonpath "$[0].appliedFactor" == 1.285714
jsonpath "$[0].suggestedPrice" == 80000
jsonpath "$[0].appliedPrice" == 90000
jsonpath "$[0].delta" == 10000
jsonpath "$[0].deltaPct" == 12.5
jsonpath "$[0].adjustmentReason" == "Alta demanda de especialista"
jsonpath "$[0].source" == "manual"
