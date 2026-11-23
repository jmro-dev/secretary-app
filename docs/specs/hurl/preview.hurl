GET http://localhost:4010/finances/prices/preview
HTTP 200
[Asserts]
header "sl-violations" not exists
jsonpath "$.period" == "2026-Q1"
jsonpath "$.basePrice" == 70000
jsonpath "$.inflationFactor" == 1.142857
jsonpath "$.suggestedPrice" == 80000
jsonpath "$.effectiveFactor" == 1.142857
jsonpath "$.roundingStep" == 500
