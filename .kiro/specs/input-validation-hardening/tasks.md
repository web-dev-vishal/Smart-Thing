# Implementation Plan: Input Validation Hardening

## Overview

Migrate all SwiftPay API endpoints to Zod-backed validation middleware. The work is additive at the route layer (wire validators in) and subtractive at the controller layer (strip inline checks out). No service or model code changes.

## Tasks

- [x] 1. Add WEBHOOK_EVENTS constant and upgrade the validate factory
  - [x] 1.1 Add `WEBHOOK_EVENTS` array to `src/utils/constants.js` alongside `SUPPORTED_CURRENCIES`
    - Values should cover the full payout lifecycle event set used by the webhook service
    - _Requirements: 2.2, 2.3_
  - [x] 1.2 Upgrade `validate()` in `src/validators/user.validate.js` to accept a `source` param (`"body" | "query" | "params"`, defaulting to `"body"`)
    - Replace `req.body` reference with `req[source]` so the factory works for all three sources
    - All existing `validate(schema)` call sites in `auth.route.js` must continue to work unchanged
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_
  - [ ]* 1.3 Write property test for the validate factory — Property 1: Validation failure always produces a well-formed 400 error response
    - **Property 1: Validation failure always produces a well-formed 400 error response**
    - **Validates: Requirements 1.2, 1.4, 10.1, 10.2, 10.3**
  - [ ]* 1.4 Write property test for the validate factory — Property 2: Valid input is coerced, defaulted, and forwarded
    - **Property 2: Valid input is coerced, defaulted, and forwarded**
    - **Validates: Requirements 1.1, 1.3**
  - [ ]* 1.5 Write property test for the validate factory — Property 3: All field errors are returned in a single response
    - **Property 3: All field errors are returned in a single response**
    - **Validates: Requirements 10.4**
  - [ ]* 1.6 Write property test for the validate factory — Property 4: Error messages contain no Zod internals
    - **Property 4: Error messages contain no Zod internals**
    - **Validates: Requirements 10.5**

- [x] 2. Add updateProfileSchema and resendVerificationSchema to user.validate.js
  - [x] 2.1 Add `updateProfileSchema` to `src/validators/user.validate.js`
    - Optional `username` (3–30 chars, `/^[a-zA-Z0-9_]+$/`) and optional `email` (valid email)
    - `.refine` that at least one field is present
    - _Requirements: 8.1, 8.2, 8.3_
  - [x] 2.2 Add `resendVerificationSchema` to `src/validators/user.validate.js`
    - Required `email` field, valid email address
    - _Requirements: 8.4_
  - [ ]* 2.3 Write property test for updateProfileSchema — Property 17: Username format matches registration rules
    - **Property 17: Username format matches registration rules**
    - **Validates: Requirements 8.1**
  - [ ]* 2.4 Write property test for updateProfileSchema — Property 16: Email fields accept valid emails and reject invalid ones
    - **Property 16: Email fields accept valid emails and reject invalid ones**
    - **Validates: Requirements 5.2, 5.6, 8.2, 8.4**
  - [ ]* 2.5 Write property test for updateProfileSchema — Property 7: Schemas with optional-only fields reject empty payloads
    - **Property 7: Schemas with optional-only fields reject empty payloads**
    - **Validates: Requirements 2.5, 4.6, 5.7, 8.3**

- [x] 3. Create src/validators/webhook.validate.js
  - [x] 3.1 Implement `createWebhookSchema`, `updateWebhookSchema`, and `webhookDeliveriesQuerySchema`
    - `createWebhookSchema`: required `url` (valid URL), optional `events` (non-empty array of `WEBHOOK_EVENTS` values, defaults to all events)
    - `updateWebhookSchema`: optional `url`, optional `events`, optional `active` (boolean); `.refine` at least one field present
    - `webhookDeliveriesQuerySchema`: `limit` coerced integer 1–100, default 20
    - Import `WEBHOOK_EVENTS` from constants
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_
  - [ ]* 3.2 Write property test for webhook schemas — Property 5: Only valid URLs are accepted for webhook creation
    - **Property 5: Only valid URLs are accepted for webhook creation**
    - **Validates: Requirements 2.1, 2.4**
  - [ ]* 3.3 Write property test for webhook schemas — Property 6: Only known Webhook_Event values are accepted in events arrays
    - **Property 6: Only known Webhook_Event values are accepted in events arrays**
    - **Validates: Requirements 2.2, 2.4**
  - [ ]* 3.4 Write property test for webhook schemas — Property 8: Query integer coercion respects bounds and defaults
    - **Property 8: Query integer coercion respects bounds and defaults (webhookDeliveriesQuerySchema)**
    - **Validates: Requirements 2.6**

- [x] 4. Create src/validators/spending-limit.validate.js
  - [x] 4.1 Implement `setSpendingLimitSchema` and `spendingLimitPeriodParamSchema`
    - `setSpendingLimitSchema`: required `period` enum, required `limitAmount` positive number, optional `currency` (uppercased, must be in `SUPPORTED_CURRENCIES`, default `"USD"`)
    - `spendingLimitPeriodParamSchema`: `period` enum `["daily","weekly","monthly"]`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_
  - [ ]* 4.2 Write property test for spending-limit schemas — Property 9: Period enum is enforced in body and params
    - **Property 9: Period enum is enforced in body and params**
    - **Validates: Requirements 3.1, 3.5, 7.5**
  - [ ]* 4.3 Write property test for spending-limit schemas — Property 10: Positive-number fields reject zero and negative values
    - **Property 10: Positive-number fields reject zero and negative values**
    - **Validates: Requirements 3.2, 4.1, 5.5, 6.2, 6.4, 7.2**
  - [ ]* 4.4 Write property test for spending-limit schemas — Property 11: Currency fields only accept Supported_Currency codes
    - **Property 11: Currency fields only accept Supported_Currency codes**
    - **Validates: Requirements 3.3, 4.3, 5.3, 6.1, 6.3**
  - [ ]* 4.5 Write property test for spending-limit schemas — Property 12: Omitting a currency field defaults to "USD"
    - **Property 12: Omitting a currency field defaults to "USD"**
    - **Validates: Requirements 3.4, 4.4, 5.4**

- [x] 5. Create src/validators/scheduler.validate.js
  - [x] 5.1 Implement `createScheduledPayoutSchema`, `updateScheduledPayoutSchema`, and `listScheduledPayoutsQuerySchema`
    - `createScheduledPayoutSchema`: required `amount` (positive), required `scheduledAt` (datetime string, `.refine` date > now), optional `currency` (default `"USD"`), optional `description` (max 500 chars)
    - `updateScheduledPayoutSchema`: all fields optional; `.refine` at least one present
    - `listScheduledPayoutsQuerySchema`: `page` and `limit` coerced positive integers, `limit` max 100, defaults 1 and 20
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_
  - [ ]* 5.2 Write property test for scheduler schemas — Property 13: scheduledAt must be a future date-time
    - **Property 13: scheduledAt must be a future date-time**
    - **Validates: Requirements 4.2, 4.5**

- [x] 6. Create src/validators/payout-user.validate.js
  - [x] 6.1 Implement `createPayoutUserSchema` and `updatePayoutUserSchema`
    - `createPayoutUserSchema`: required `userId` (regex `/^[a-zA-Z0-9_-]+$/`, 3–50 chars), optional `email`, optional `currency` (default `"USD"`), optional `initialBalance` (non-negative), optional `country`, optional `phone`
    - `updatePayoutUserSchema`: optional `currency`, optional `country` (2-char ISO), optional `email`, optional `phone`; `.refine` at least one present
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_
  - [ ]* 6.2 Write property test for payout-user schemas — Property 15: userId format is enforced on payout user creation
    - **Property 15: userId format is enforced on payout user creation**
    - **Validates: Requirements 5.1**

- [x] 7. Create src/validators/wallet.validate.js
  - [x] 7.1 Implement `walletOperationSchema` (shared for credit and debit)
    - Required `currency` (uppercased, must be in `SUPPORTED_CURRENCIES`), required `amount` (positive number)
    - _Requirements: 6.1, 6.2, 6.3, 6.4_
  - [ ]* 7.2 Write property test for wallet schema — Property 14: Wallet operation schema validates both credit and debit identically
    - **Property 14: Wallet operation schema validates both credit and debit identically**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4**

- [x] 8. Create src/validators/admin.validate.js
  - [x] 8.1 Implement `updateUserStatusSchema`, `adjustBalanceSchema`, `adminSetSpendingLimitSchema`, `paginationQuerySchema`, and `volumeReportQuerySchema`
    - `updateUserStatusSchema`: required `status` enum `["active","suspended","banned"]`
    - `adjustBalanceSchema`: required `amount` (non-zero number), required `type` enum `["credit","debit"]`, required `reason` (1–500 chars)
    - `adminSetSpendingLimitSchema`: required `period` enum, required `limitAmount` positive, optional `currency` (default `"USD"`)
    - `paginationQuerySchema`: `page` and `limit` coerced positive integers, max 200, defaults 1 and 50
    - `volumeReportQuerySchema`: `days` coerced integer 1–365, default 30
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8_
  - [ ]* 8.2 Write property test for admin schemas — Property 8: Query integer coercion respects bounds and defaults (paginationQuerySchema and volumeReportQuerySchema)
    - **Property 8: Query integer coercion respects bounds and defaults**
    - **Validates: Requirements 7.6, 7.7, 7.8**

- [x] 9. Create src/validators/payout-user.validate.js — transaction history and export schemas
  - [x] 9.1 Add `transactionHistoryQuerySchema` and `exportQuerySchema` to `src/validators/payout-user.validate.js`
    - `transactionHistoryQuerySchema`: `limit` coerced integer, max 200, default 50; optional `status` enum `["initiated","processing","completed","failed"]`
    - `exportQuerySchema`: optional `format` enum `["json","csv"]` default `"json"`; optional `status` enum; optional `startDate` and `endDate` datetime strings; `.refine` startDate ≤ endDate when both present
    - _Requirements: 9.1, 9.2, 9.3, 9.4_
  - [ ]* 9.2 Write property test for transaction history/export schemas — Property 18: Transaction status filter accepts only known status values
    - **Property 18: Transaction status filter accepts only known status values**
    - **Validates: Requirements 9.2**
  - [ ]* 9.3 Write property test for export schema — Property 19: Export date range requires startDate ≤ endDate
    - **Property 19: Export date range requires startDate ≤ endDate**
    - **Validates: Requirements 9.4**

- [x] 10. Checkpoint — Ensure all validator files are complete and tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Wire validators into src/routes/auth.route.js
  - [x] 11.1 Add `validate(updateProfileSchema)` middleware to `PUT /profile` before the controller
    - Import `updateProfileSchema` from `user.validate.js`
    - _Requirements: 8.1, 8.2, 8.3_
  - [x] 11.2 Add `validate(resendVerificationSchema)` middleware to `POST /resend-verification` before the controller
    - Import `resendVerificationSchema` from `user.validate.js`
    - _Requirements: 8.4_

- [x] 12. Wire validators into src/routes/webhook.route.js
  - [x] 12.1 Add `validate(createWebhookSchema)` to `POST /`
  - [x] 12.2 Add `validate(updateWebhookSchema)` to `PATCH /:id`
  - [x] 12.3 Add `validate(webhookDeliveriesQuerySchema, "query")` to `GET /:id/deliveries`
    - Import all schemas from `webhook.validate.js`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

- [x] 13. Wire validators into src/routes/spending-limit.route.js
  - [x] 13.1 Add `validate(setSpendingLimitSchema)` to `POST /`
  - [x] 13.2 Add `validate(spendingLimitPeriodParamSchema, "params")` to `DELETE /:period`
    - Import schemas from `spending-limit.validate.js`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 14. Wire validators into src/routes/scheduler.route.js
  - [x] 14.1 Add `validate(createScheduledPayoutSchema)` to `POST /`
  - [x] 14.2 Add `validate(updateScheduledPayoutSchema)` to `PATCH /:id`
  - [x] 14.3 Add `validate(listScheduledPayoutsQuerySchema, "query")` to `GET /`
    - Import schemas from `scheduler.validate.js`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

- [x] 15. Wire validators into src/routes/payout.route.js
  - [x] 15.1 Add `validate(createPayoutUserSchema)` to `POST /user`
  - [x] 15.2 Add `validate(updatePayoutUserSchema)` to `PUT /user/:userId`
  - [x] 15.3 Add `validate(walletOperationSchema)` to `POST /user/:userId/wallet/credit`
  - [x] 15.4 Add `validate(walletOperationSchema)` to `POST /user/:userId/wallet/debit`
  - [x] 15.5 Add `validate(transactionHistoryQuerySchema, "query")` to `GET /user/:userId/history`
  - [x] 15.6 Add `validate(exportQuerySchema, "query")` to `GET /user/:userId/export`
    - Import schemas from `payout-user.validate.js` and `wallet.validate.js`
    - Leave the existing `validatePayout` middleware on `POST /` untouched
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 6.1, 6.2, 6.3, 6.4, 9.1, 9.2, 9.3, 9.4_

- [x] 16. Wire validators into src/routes/admin.route.js
  - [x] 16.1 Add `validate(updateUserStatusSchema)` to `PATCH /users/:userId/status`
  - [x] 16.2 Add `validate(adjustBalanceSchema)` to `POST /users/:userId/balance`
  - [x] 16.3 Add `validate(adminSetSpendingLimitSchema)` to `POST /users/:userId/spending-limits`
  - [x] 16.4 Add `validate(paginationQuerySchema, "query")` to `GET /transactions`
  - [x] 16.5 Add `validate(paginationQuerySchema, "query")` to `GET /users`
  - [x] 16.6 Add `validate(volumeReportQuerySchema, "query")` to `GET /reports/volume`
    - Import schemas from `admin.validate.js`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8_

- [x] 17. Checkpoint — Ensure all route wiring is correct and tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 18. Strip inline validation from controllers
  - [x] 18.1 Remove inline field-presence and type checks from `src/controllers/webhook.controller.js` for fields now covered by validators
    - _Requirements: 11.1, 11.2, 11.3_
  - [x] 18.2 Remove inline field-presence and type checks from `src/controllers/spending-limit.controller.js`
    - _Requirements: 11.1, 11.2, 11.3_
  - [x] 18.3 Remove inline field-presence and type checks from `src/controllers/scheduler.controller.js`
    - _Requirements: 11.1, 11.2, 11.3_
  - [x] 18.4 Remove inline field-presence and type checks from `src/controllers/admin.controller.js`
    - _Requirements: 11.1, 11.2, 11.3_
  - [x] 18.5 Remove inline field-presence and type checks from `src/controllers/payout.controller.js`
    - _Requirements: 11.1, 11.2, 11.3_
  - [x] 18.6 Remove inline field-presence and type checks from `src/controllers/auth.controller.js` for `PUT /profile` and `POST /resend-verification`
    - _Requirements: 11.1, 11.2, 11.3_

- [ ] 19. Write property-based tests using fast-check
  - [ ]* 19.1 Write property tests in `src/validators/__tests__/user.validate.test.js`
    - Property 1: Validation failure always produces a well-formed 400 error response
    - Property 2: Valid input is coerced, defaulted, and forwarded
    - Property 3: All field errors are returned in a single response
    - Property 4: Error messages contain no Zod internals
    - Property 7: Schemas with optional-only fields reject empty payloads (updateProfileSchema)
    - Property 16: Email fields accept valid emails and reject invalid ones
    - Property 17: Username format matches registration rules
    - Tag each test with `// Feature: input-validation-hardening, Property <N>: <text>`
    - Use `numRuns: 100` for each `fc.assert`
    - **Validates: Requirements 1.2, 1.3, 1.4, 8.1, 8.2, 8.3, 8.4, 10.1–10.5**
  - [ ]* 19.2 Write property tests in `src/validators/__tests__/webhook.validate.test.js`
    - Property 5: Only valid URLs are accepted for webhook creation
    - Property 6: Only known Webhook_Event values are accepted in events arrays
    - Property 8: Query integer coercion respects bounds and defaults (webhookDeliveriesQuerySchema)
    - **Validates: Requirements 2.1, 2.2, 2.4, 2.6**
  - [ ]* 19.3 Write property tests in `src/validators/__tests__/spending-limit.validate.test.js`
    - Property 9: Period enum is enforced in body and params
    - Property 10: Positive-number fields reject zero and negative values (limitAmount)
    - Property 11: Currency fields only accept Supported_Currency codes
    - Property 12: Omitting a currency field defaults to "USD"
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
  - [ ]* 19.4 Write property tests in `src/validators/__tests__/scheduler.validate.test.js`
    - Property 13: scheduledAt must be a future date-time
    - **Validates: Requirements 4.2, 4.5**
  - [ ]* 19.5 Write property tests in `src/validators/__tests__/payout-user.validate.test.js`
    - Property 15: userId format is enforced on payout user creation
    - Property 18: Transaction status filter accepts only known status values
    - Property 19: Export date range requires startDate ≤ endDate
    - **Validates: Requirements 5.1, 9.2, 9.4**
  - [ ]* 19.6 Write property tests in `src/validators/__tests__/wallet.validate.test.js`
    - Property 14: Wallet operation schema validates both credit and debit identically
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4**
  - [ ]* 19.7 Write property tests in `src/validators/__tests__/admin.validate.test.js`
    - Property 8: Query integer coercion respects bounds and defaults (paginationQuerySchema, volumeReportQuerySchema)
    - **Validates: Requirements 7.6, 7.7, 7.8**

- [x] 20. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at logical boundaries
- Property tests validate universal correctness properties using `fast-check` with `numRuns: 100`
- The existing `validatePayout` middleware on `POST /payout` is left untouched
- All `validate(schema)` call sites in `auth.route.js` continue to work without modification after the factory upgrade
