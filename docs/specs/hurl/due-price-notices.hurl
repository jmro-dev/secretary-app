GET http://localhost:4010/finances/bookings/due-price-notices?days=7
HTTP 200
[Asserts]
header "sl-violations" not exists
jsonpath "$[0].bookingId" == "bkg-711"
jsonpath "$[0].appointmentAt" == "2026-12-15T10:30:00Z"
jsonpath "$[0].quotedPrice" == 70000
jsonpath "$[0].currentPrice" == 80000
jsonpath "$[0].delta" == 10000
jsonpath "$[0].daysBefore" == 7
jsonpath "$[0].notifiedAt" == null
