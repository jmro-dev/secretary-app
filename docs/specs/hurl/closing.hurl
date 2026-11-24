GET http://localhost:4010/finances/prices/closing?year=2026
HTTP 200
[Asserts]
header "sl-violations" not exists
jsonpath "$.year" == 2026
jsonpath "$.inflationYoY" == 0.45
jsonpath "$.appliedCumulative" == 0.40
jsonpath "$.margin" == -0.05
jsonpath "$.verdict" == "cheaper"
