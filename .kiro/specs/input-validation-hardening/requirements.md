# Requirements Document

## Introduction

SwiftPay currently has Zod validation on auth routes and the core payout `POST /` endpoint. However, the majority of routes — webhook management, spending limits, scheduler, admin operations, payout user profile management, wallet operations, and all query parameter inputs — rely on ad-hoc inline `if (!field)` checks scattered across controllers. This feature hardens the entire API surface by migrating all request validation to Zod schemas, covering both request bodies and query parameters, and ensuring consistent error response shapes across every endpoint.

## Glossary

- **Validator**: A Zod schema plus its Express middleware wrapper that validates a request before it reaches a controller.
- **Body_Validator**: A Validator that operates on `req.body`.
- **Query_Validator**: A Validator that operates on `req.query`.
- **Params_Validator**: A Validator that operates on `req.params`.
- **Validation_Middleware**: The Express middleware function produced by wrapping a Zod schema, responsible for calling `safeParse` and returning a 400 response on failure.
- **Controller**: An Express route handler that receives a pre-validated request and calls the appropriate service.
- **Route**: An Express router entry that chains Validation_Middleware before a Controller.
- **Error_Response**: A JSON object with shape `{ success: false, errors: string[] }` returned on validation failure.
- **Supported_Currency**: A currency code present in `src/utils/constants.js` `SUPPORTED_CURRENCIES`.
- **Period**: One of the string values `"daily"`, `"weekly"`, or `"monthly"` used for spending limits.
- **Webhook_Event**: One of the string values representing a payout lifecycle event that a webhook can subscribe to.

---

## Requirements

### Requirement 1: Centralised Validation Middleware Factory

**User Story:** As a developer, I want a single reusable `validate` factory for both body and query validation, so that every route uses the same error response shape and I don't duplicate boilerplate.

#### Acceptance Criteria

1. THE Validation_Middleware SHALL accept a Zod schema and a source (`"body"`, `"query"`, or `"params"`) and return an Express middleware function.
2. WHEN a request fails schema validation, THE Validation_Middleware SHALL return HTTP 400 with an Error_Response containing all Zod error messages.
3. WHEN a request passes schema validation, THE Validation_Middleware SHALL replace the validated source on `req` with the parsed (coerced and defaulted) Zod output and call `next()`.
4. THE Validation_Middleware SHALL not call `next(err)` for validation failures — validation errors are always HTTP 400, not 500.
5. THE Validation_Middleware SHALL be exported from a single shared location so all route files import from one place.

---

### Requirement 2: Webhook Request Validation

**User Story:** As a developer, I want Zod schemas for webhook create and update requests, so that invalid URLs and unknown event types are rejected before reaching the service layer.

#### Acceptance Criteria

1. WHEN `POST /api/webhooks` is called, THE Validator SHALL require `url` to be a valid URL string.
2. WHEN `POST /api/webhooks` is called with an `events` field, THE Validator SHALL require `events` to be a non-empty array of known Webhook_Event strings.
3. WHEN `POST /api/webhooks` is called without an `events` field, THE Validator SHALL default `events` to an array containing all supported Webhook_Event values.
4. WHEN `PATCH /api/webhooks/:id` is called, THE Validator SHALL accept an optional `url` (valid URL), optional `events` (non-empty array of Webhook_Event), and optional `active` (boolean).
5. WHEN `PATCH /api/webhooks/:id` is called with no recognised fields, THE Validator SHALL return HTTP 400 with an Error_Response.
6. WHEN `GET /api/webhooks/:id/deliveries` is called, THE Query_Validator SHALL coerce `limit` to an integer between 1 and 100, defaulting to 20.

---

### Requirement 3: Spending Limit Request Validation

**User Story:** As a developer, I want Zod schemas for spending limit creation, so that invalid periods and non-positive amounts are rejected at the boundary.

#### Acceptance Criteria

1. WHEN `POST /api/spending-limits` is called, THE Validator SHALL require `period` to be one of the valid Period values.
2. WHEN `POST /api/spending-limits` is called, THE Validator SHALL require `limitAmount` to be a positive number greater than 0.
3. WHEN `POST /api/spending-limits` is called with a `currency` field, THE Validator SHALL require `currency` to be a Supported_Currency code.
4. WHEN `POST /api/spending-limits` is called without a `currency` field, THE Validator SHALL default `currency` to `"USD"`.
5. WHEN `DELETE /api/spending-limits/:period` is called, THE Params_Validator SHALL require `period` to be one of the valid Period values and return HTTP 400 if not.

---

### Requirement 4: Scheduler Request Validation

**User Story:** As a developer, I want Zod schemas for scheduled payout creation and updates, so that past dates, non-positive amounts, and unsupported currencies are caught before hitting the database.

#### Acceptance Criteria

1. WHEN `POST /api/scheduled-payouts` is called, THE Validator SHALL require `amount` to be a positive number.
2. WHEN `POST /api/scheduled-payouts` is called, THE Validator SHALL require `scheduledAt` to be a date-time string that parses to a future point in time relative to the moment of the request.
3. WHEN `POST /api/scheduled-payouts` is called with a `currency` field, THE Validator SHALL require `currency` to be a Supported_Currency code.
4. WHEN `POST /api/scheduled-payouts` is called without a `currency` field, THE Validator SHALL default `currency` to `"USD"`.
5. WHEN `PATCH /api/scheduled-payouts/:id` is called, THE Validator SHALL accept optional `amount` (positive number), optional `scheduledAt` (future date-time string), and optional `description` (string up to 500 characters).
6. WHEN `PATCH /api/scheduled-payouts/:id` is called with no recognised fields, THE Validator SHALL return HTTP 400 with an Error_Response.
7. WHEN `GET /api/scheduled-payouts` is called, THE Query_Validator SHALL coerce `page` and `limit` to positive integers, cap `limit` at 100, and default `page` to 1 and `limit` to 20.

---

### Requirement 5: Payout User Profile Validation

**User Story:** As a developer, I want Zod schemas for payout user create and update requests, so that invalid emails, unsupported currencies, and malformed phone numbers are rejected consistently.

#### Acceptance Criteria

1. WHEN `POST /api/payout/user` is called, THE Validator SHALL require `userId` to be an alphanumeric string (hyphens and underscores allowed) between 3 and 50 characters.
2. WHEN `POST /api/payout/user` is called with an `email` field, THE Validator SHALL require `email` to be a valid email address.
3. WHEN `POST /api/payout/user` is called with a `currency` field, THE Validator SHALL require `currency` to be a Supported_Currency code.
4. WHEN `POST /api/payout/user` is called without a `currency` field, THE Validator SHALL default `currency` to `"USD"`.
5. WHEN `POST /api/payout/user` is called with an `initialBalance` field, THE Validator SHALL require `initialBalance` to be a non-negative number.
6. WHEN `PUT /api/payout/user/:userId` is called, THE Validator SHALL accept optional `currency` (Supported_Currency), optional `country` (2-letter ISO code), optional `email` (valid email), and optional `phone` (string).
7. WHEN `PUT /api/payout/user/:userId` is called with no recognised fields, THE Validator SHALL return HTTP 400 with an Error_Response.

---

### Requirement 6: Wallet Operation Validation

**User Story:** As a developer, I want Zod schemas for wallet credit and debit requests, so that missing currencies, unsupported currencies, and non-positive amounts are rejected before any balance mutation occurs.

#### Acceptance Criteria

1. WHEN `POST /api/payout/user/:userId/wallet/credit` is called, THE Validator SHALL require `currency` to be a Supported_Currency code.
2. WHEN `POST /api/payout/user/:userId/wallet/credit` is called, THE Validator SHALL require `amount` to be a positive number greater than 0.
3. WHEN `POST /api/payout/user/:userId/wallet/debit` is called, THE Validator SHALL require `currency` to be a Supported_Currency code.
4. WHEN `POST /api/payout/user/:userId/wallet/debit` is called, THE Validator SHALL require `amount` to be a positive number greater than 0.

---

### Requirement 7: Admin Operation Validation

**User Story:** As a developer, I want Zod schemas for admin endpoints that mutate data, so that invalid status values, missing reasons, and bad amount types are caught before reaching the service layer.

#### Acceptance Criteria

1. WHEN `PATCH /api/admin/users/:userId/status` is called, THE Validator SHALL require `status` to be one of `"active"`, `"suspended"`, or `"banned"`.
2. WHEN `POST /api/admin/users/:userId/balance` is called, THE Validator SHALL require `amount` to be a non-zero number.
3. WHEN `POST /api/admin/users/:userId/balance` is called, THE Validator SHALL require `type` to be one of `"credit"` or `"debit"`.
4. WHEN `POST /api/admin/users/:userId/balance` is called, THE Validator SHALL require `reason` to be a non-empty string of at most 500 characters.
5. WHEN `POST /api/admin/users/:userId/spending-limits` is called, THE Validator SHALL require `period` to be a valid Period value and `limitAmount` to be a positive number.
6. WHEN `GET /api/admin/transactions` is called, THE Query_Validator SHALL coerce `page` and `limit` to positive integers, cap `limit` at 200, and default `page` to 1 and `limit` to 50.
7. WHEN `GET /api/admin/users` is called, THE Query_Validator SHALL coerce `page` and `limit` to positive integers, cap `limit` at 200, and default `page` to 1 and `limit` to 50.
8. WHEN `GET /api/admin/reports/volume` is called, THE Query_Validator SHALL coerce `days` to a positive integer between 1 and 365, defaulting to 30.

---

### Requirement 8: Auth Profile Update Validation

**User Story:** As a developer, I want a Zod schema for the profile update endpoint, so that invalid usernames and emails are rejected consistently with the rest of the auth validators.

#### Acceptance Criteria

1. WHEN `PUT /api/auth/profile` is called with a `username` field, THE Validator SHALL require `username` to match the same rules as registration: 3–30 characters, alphanumeric and underscores only.
2. WHEN `PUT /api/auth/profile` is called with an `email` field, THE Validator SHALL require `email` to be a valid email address.
3. WHEN `PUT /api/auth/profile` is called with no recognised fields, THE Validator SHALL return HTTP 400 with an Error_Response.
4. WHEN `POST /api/auth/resend-verification` is called, THE Validator SHALL require `email` to be a valid email address, consistent with the `forgotPasswordSchema`.

---

### Requirement 9: Transaction History and Export Query Validation

**User Story:** As a developer, I want Zod schemas for query parameters on history and export endpoints, so that invalid pagination values, unknown status filters, and bad date formats are rejected before hitting the database.

#### Acceptance Criteria

1. WHEN `GET /api/payout/user/:userId/history` is called, THE Query_Validator SHALL coerce `limit` to a positive integer, cap it at 200, and default it to 50.
2. WHEN `GET /api/payout/user/:userId/history` is called with a `status` query parameter, THE Query_Validator SHALL require `status` to be one of `"initiated"`, `"processing"`, `"completed"`, or `"failed"`.
3. WHEN `GET /api/payout/user/:userId/export` is called, THE Query_Validator SHALL require `format` to be one of `"json"` or `"csv"`, defaulting to `"json"`.
4. WHEN `GET /api/payout/user/:userId/export` is called with `startDate` or `endDate`, THE Query_Validator SHALL require both values to be valid ISO 8601 date strings and `startDate` to be before or equal to `endDate`.

---

### Requirement 10: Consistent Error Response Shape

**User Story:** As an API consumer, I want all validation errors to return the same JSON shape, so that my client code can handle errors uniformly without special-casing each endpoint.

#### Acceptance Criteria

1. THE Validation_Middleware SHALL always return HTTP 400 for validation failures.
2. THE Validation_Middleware SHALL always include `success: false` in the error response body.
3. THE Validation_Middleware SHALL always include an `errors` array of human-readable strings in the error response body.
4. WHEN multiple fields fail validation simultaneously, THE Validation_Middleware SHALL include all field errors in the `errors` array in a single response.
5. THE Validation_Middleware SHALL not expose internal Zod schema details (e.g. type names, path arrays) in the `errors` array — only the human-readable message strings.

---

### Requirement 11: Remove Inline Ad-hoc Validation from Controllers

**User Story:** As a developer, I want controllers to be free of manual `if (!field)` validation checks, so that validation logic lives in one place and controllers stay thin.

#### Acceptance Criteria

1. WHEN a Zod Validator is applied to a route, THE Controller for that route SHALL not contain duplicate inline field-presence or type checks for the same fields.
2. THE Controller SHALL trust that `req.body`, `req.query`, and `req.params` have already been validated and coerced by the time the Controller function executes.
3. WHEN a Controller currently returns HTTP 400 for a missing field that is now covered by a Validator, THE Controller SHALL delegate that check to the Validator and remove the inline check.
