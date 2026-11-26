---
title: Database Stored Procedures for Financial and Booking Invariants
type: decision
responsibility: Why critical financial calculations and slot reservations run in MySQL stored routines.
sources:
  - server/01-schema.sql
synced: 41f85285
sources_key: 4d2cee7844aa
related:
  - ../architecture.md
  - ../flows/appointment-booking.md
  - ../flows/price-calculation.md
generated: { by: codex/gpt-6, at: 2026-11-25T16:16:00Z }
---

# Database Stored Procedures for Financial and Booking Invariants

## Context

Secretary App handles appointments and payments concurrently across multiple interfaces (web app for receptionists, mobile app for physicians, and automated bookings via WhatsApp). Race conditions during slot booking or discrepancies in tariff calculations can lead to double bookings and accounting corruption.

## Decision

Enforce concurrency rules and monetary allocations inside MySQL stored procedures and functions:
1. Slot collision detection runs atomically inside `sp_book_appointment` ([server/01-schema.sql:1786-1793](../../server/01-schema.sql#L1786-L1793)).
2. Complex price resolution with institution splits runs deterministically inside `fn_calculate_service_price` ([server/01-schema.sql:1471](../../server/01-schema.sql#L1471)).
3. Bulk tariff changes run transactionally inside `proc_apply_price_increase`, which records each old and new value in `price_changes` and rejects a reused batch ID ([server/01-schema.sql:2926-2956](../../server/01-schema.sql#L2926)).
4. Triggers enforce audit records on transaction modifications (`transaction_audits`).

## Discarded Alternative

Implementing lock management and tariff math strictly within Node.js application services was rejected. Node-level locking cannot protect against out-of-band updates, background jobs, or direct operations from other services (such as Go workers or external sync scripts) accessing the database simultaneously.
