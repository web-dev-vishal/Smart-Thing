# Design Document — Input Validation Hardening

## Overview

SwiftPay's API currently validates requests in two places: a handful of Zod schemas on auth and the core payout route, and ad-hoc `if (!field)` guards scattered across six controllers. This inconsistency means error shapes differ per endpoint, coercion is manual and error-prone, and controllers carry logic that doesn't belong to them.

This feature migrates every endpoint to Zod-backed validation middleware, producing a uniform `{ success: false, errors: string[] }` error shape across the entire API surface. Controllers become thin: they trust that `req.body`, `req.query`, and `req.params` have already been validated and coerced before they run.

The change is purely additive at the route layer and purely subtractive at the controller layer — no service or model code changes.

---

## Architecture

### Request lifecycle (after this change)

```
HTTP Request
    │
    ▼
Rate Limiter (where applicable)
    │
    ▼
Auth Middleware (where applicable)
    │
    ▼
Validation Middleware  ◄── Zod schema, source: "body" | "query" | "params"
    │                       • safeParse against schema
    │                       • on failure → 400 { success: false, errors: [...] }
    │                       • on success → replace req[source] with parsed data, call next()
    ▼
Controller
    │  (req.body / req.query / req.params are already coerced and defaulted)
    ▼
Service → Database
```

### Key design decisions

**Single `validate(schema, source)` factory** — the existing `validate(schema)` in `user.validate.js` only handles `req.body`. Extending it to accept a `source` parameter (`"body"` | `"query"` | `"params"`, defaulting to `"body"`) lets every route use the same factory without any new abstractions. The factory stays in `user.validate.js` since that's the shared location already imported by `auth.route.js`.

**One validator file per domain** — mirrors the existing `user.validate.js` / `payout.validate.js` split. New files: `webhook.validate.js`, `spending-limit.validate.js`, `scheduler.validate.js`, `payout-user.validate.js`, `wallet.validate.js`, `admin.validate.js`. Each file exports named schemas and, where convenient, pre-bound middleware.

**`WEBHOOK_EVENTS` constant in `constants.js`** — webhook event strings are referenced by both the validator and potentially the service layer. Centralising them in constants avoids duplication.

**No `next(err)` for validation failures** — validation errors are always HTTP 400, never passed to the error middleware. This matches the existing pattern in `user.validate.js`.

---

## Components and Interfaces

### 1. Updated `validate` factory — `src/validators/user.validate.js`

```js
// source defaults to "body" so all existing call sites keep working unchanged
export const validate = (schema, source = "body") => (req, res, next) => { ... }
```

All existing `validate(schema)` call sites in `auth.route.js` continue to work without modification.

### 2. New validator files

| File | Exports |
|---|---|
| `src/validators/webhook.validate.js` | `createWebhookSchema`, `updateWebhookSchema`, `webhookDeliveriesQuerySchema` |
| `src/validators/spending-limit.validate.js` | `setSpendingLimitSchema`, `spendingLimitPeriodParamSchema` |
| `src/validators/scheduler.validate.js` | `createScheduledPayoutSchema`, `updateScheduledPayoutSchema`, `listScheduledPayoutsQuerySchema` |
| `src/validators/payout-user.validate.js` | `createPayoutUserSchema`, `updatePayoutUserSchema` |
| `src/validators/wallet.validate.js` | `walletOperationSchema` (shared for credit and debit) |
| `src/validators/admin.validate.js` | `updateUserStatusSchema`, `adjustBalanceSchema`, `adminSetSpendingLimitSchema`, `paginationQuerySchema`, `volumeReportQuerySchema` |

### 3. Updated `src/utils/constants.js`

Adds `WEBHOOK_EVENTS` array alongside the existing `SUPPORTED_CURRENCIES`.

### 4. Route files — validator wiring

Each route file gains `validate(schema)` or `validate(schema, "query")` / `validate(schema, "params")` calls in the middleware chain, before the controller.

### 5. Controller files — inline check removal

The six controllers listed in the requirements lose their manual `if (!field)`, `parseInt(...)`, `parseFloat(...)`, and enum-check blocks for fields now covered by validators.

---

## Data Models

No model changes. This feature is entirely in the request-handling layer.

### Schema shapes (Zod)

#### `createWebhookSchema` (body)
```
{
  url:    z.string().url()
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1).default([...all events])
}
```

#### `updateWebhookSchema` (body)
```
{
  url?:    z.string().url()
  events?: z.array(z.enum(WEBHOOK_EVENTS)).min(1)
  active?: z.boolean()
}
.refine(at least one field present)
```

#### `webhookDeliveriesQuerySchema` (query)
```
{
  limit: z.coerce.number().int().min(1).max(100).default(20)
}
```

#### `setSpendingLimitSchema` (body)
```
{
  period:      z.enum(["daily","weekly","monthly"])
  limitAmount: z.number().positive()
  currency?:   z.string().toUpperCase().refine(SUPPORTED_CURRENCIES).default("USD")
}
```

#### `spendingLimitPeriodParamSchema` (params)
```
{
  period: z.enum(["daily","weekly","monthly"])
}
```

#### `createScheduledPayoutSchema` (body)
```
{
  amount:      z.number().positive()
  scheduledAt: z.string().datetime().refine(date > now)
  currency?:   z.string().toUpperCase().refine(SUPPORTED_CURRENCIES).default("USD")
  description?: z.string().max(500)
}
```

#### `updateScheduledPayoutSchema` (body)
```
{
  amount?:      z.number().positive()
  scheduledAt?: z.string().datetime().refine(date > now)
  description?: z.string().max(500)
}
.refine(at least one field present)
```

#### `listScheduledPayoutsQuerySchema` (query)
```
{
  page:  z.coerce.number().int().positive().default(1)
  limit: z.coerce.number().int().positive().max(100).default(20)
}
```

#### `createPayoutUserSchema` (body)
```
{
  userId:          z.string().regex(/^[a-zA-Z0-9_-]+$/).min(3).max(50)
  email?:          z.string().email()
  currency?:       z.string().toUpperCase().refine(SUPPORTED_CURRENCIES).default("USD")
  initialBalance?: z.number().nonnegative()
  country?:        z.string()
  phone?:          z.string()
}
```

#### `updatePayoutUserSchema` (body)
```
{
  currency?: z.string().toUpperCase().refine(SUPPORTED_CURRENCIES)
  country?:  z.string().length(2)
  email?:    z.string().email()
  phone?:    z.string()
}
.refine(at least one field present)
```

#### `walletOperationSchema` (body)
```
{
  currency: z.string().toUpperCase().refine(SUPPORTED_CURRENCIES)
  amount:   z.number().positive()
}
```

#### `updateUserStatusSchema` (body)
```
{
  status: z.enum(["active","suspended","banned"])
}
```

#### `adjustBalanceSchema` (body)
```
{
  amount: z.number().nonzero()   // positive for credit, negative for debit
  type:   z.enum(["credit","debit"])
  reason: z.string().min(1).max(500)
}
```

#### `adminSetSpendingLimitSchema` (body)
```
{
  period:      z.enum(["daily","weekly","monthly"])
  limitAmount: z.number().positive()
  currency?:   z.string().toUpperCase().refine(SUPPORTED_CURRENCIES).default("USD")
}
```

#### `paginationQuerySchema` (query)
```
{
  page:  z.coerce.number().int().positive().max(200).default(1)
  limit: z.coerce.number().int().positive().max(200).default(50)
}
```

#### `volumeReportQuerySchema` (query)
```
{
  days: z.coerce.number().int().positive().min(1).max(365).default(30)
}
```

#### `transactionHistoryQuerySchema` (query)
```
{
  limit:  z.coerce.number().int().positive().max(200).default(50)
  status?: z.enum(["initiated","processing","completed","failed"])
}
```

#### `exportQuerySchema` (query)
```
{
  format?:    z.enum(["json","csv"]).default("json")
  status?:    z.enum(["initiated","processing","completed","failed"])
  startDate?: z.string().datetime()
  endDate?:   z.string().datetime()
}
.refine(startDate <= endDate when both present)
```

#### `updateProfileSchema` (body) — new, in `user.validate.js`
```
{
  username?: z.string().regex(/^[a-zA-Z0-9_]+$/).min(3).max(30)
  email?:    z.string().email()
}
.refine(at least one field present)
```

#### `resendVerificationSchema` (body) — new, in `user.validate.js`
```
{
  email: z.string().email()
}
```


---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Validation failure always produces a well-formed 400 error response

*For any* Zod schema, any source (`"body"`, `"query"`, `"params"`), and any request whose source data fails that schema, the middleware must respond with HTTP 400, `success: false`, and a non-empty `errors` array of strings — and must never call `next()` with or without an argument.

**Validates: Requirements 1.2, 1.4, 10.1, 10.2, 10.3**

---

### Property 2: Valid input is coerced, defaulted, and forwarded

*For any* Zod schema, any source, and any request whose source data passes that schema, the middleware must replace `req[source]` with the Zod-parsed output (coerced types, applied defaults) and call `next()` with no arguments.

**Validates: Requirements 1.1, 1.3**

---

### Property 3: All field errors are returned in a single response

*For any* request body that has multiple invalid fields simultaneously, the `errors` array in the 400 response must contain one entry per failing field — not just the first failure.

**Validates: Requirements 10.4**

---

### Property 4: Error messages contain no Zod internals

*For any* validation failure, every string in the `errors` array must be a plain human-readable message — it must not contain Zod type names, path arrays, or the string `"ZodError"`.

**Validates: Requirements 10.5**

---

### Property 5: Only valid URLs are accepted for webhook creation

*For any* string value supplied as `url` in a webhook create or update request, the validator must accept it if and only if it is a syntactically valid URL (parseable by the WHATWG URL standard).

**Validates: Requirements 2.1, 2.4**

---

### Property 6: Only known Webhook_Event values are accepted in events arrays

*For any* array supplied as `events`, the validator must reject it if it is empty or contains any string not present in `WEBHOOK_EVENTS`, and must accept it otherwise.

**Validates: Requirements 2.2, 2.4**

---

### Property 7: Schemas with optional-only fields reject empty payloads

*For any* schema that uses `.refine(at least one field present)` (webhook update, scheduled payout update, payout user update, profile update), a request body that contains no recognised fields must be rejected with HTTP 400.

**Validates: Requirements 2.5, 4.6, 5.7, 8.3**

---

### Property 8: Query integer coercion respects bounds and defaults

*For any* query parameter schema that coerces an integer (limit, page, days), the parsed output must be an integer within the declared min/max range, and omitting the parameter must produce the declared default value.

**Validates: Requirements 2.6, 4.7, 7.6, 7.7, 7.8, 9.1**

---

### Property 9: Period enum is enforced in body and params

*For any* string supplied as `period` (in body or params), the validator must accept it if and only if it equals `"daily"`, `"weekly"`, or `"monthly"`.

**Validates: Requirements 3.1, 3.5, 7.5**

---

### Property 10: Positive-number fields reject zero and negative values

*For any* field declared as a positive number (`limitAmount`, `amount` in scheduler/wallet/payout-user), the validator must reject zero, negative numbers, and non-numeric strings.

**Validates: Requirements 3.2, 4.1, 5.5, 6.2, 6.4, 7.2**

---

### Property 11: Currency fields only accept Supported_Currency codes

*For any* string supplied as `currency`, the validator must accept it if and only if it appears in `SUPPORTED_CURRENCIES` (after uppercasing).

**Validates: Requirements 3.3, 4.3, 5.3, 6.1, 6.3**

---

### Property 12: Omitting a currency field defaults to "USD"

*For any* schema with an optional `currency` field that carries a `"USD"` default, omitting `currency` from the request must result in `req.body.currency === "USD"` after parsing.

**Validates: Requirements 2.3 (events default is analogous), 3.4, 4.4, 5.4**

---

### Property 13: scheduledAt must be a future date-time

*For any* string supplied as `scheduledAt`, the validator must reject it if it parses to a point in time that is not strictly after the moment of validation, and accept it otherwise.

**Validates: Requirements 4.2, 4.5**

---

### Property 14: Wallet operation schema validates both credit and debit identically

*For any* request body supplied to either the credit or debit wallet endpoint, the same `walletOperationSchema` must accept it if and only if `currency` is a Supported_Currency and `amount` is a positive number.

**Validates: Requirements 6.1, 6.2, 6.3, 6.4**

---

### Property 15: userId format is enforced on payout user creation

*For any* string supplied as `userId`, the validator must accept it if and only if it matches `/^[a-zA-Z0-9_-]+$/` and has length between 3 and 50 inclusive.

**Validates: Requirements 5.1**

---

### Property 16: Email fields accept valid emails and reject invalid ones

*For any* string supplied to an `email` field (profile update, resend-verification, payout user create/update), the validator must accept it if and only if it is a syntactically valid email address.

**Validates: Requirements 5.2, 5.6, 8.2, 8.4**

---

### Property 17: Username format matches registration rules

*For any* string supplied as `username` in a profile update, the validator must accept it if and only if it matches `/^[a-zA-Z0-9_]+$/` and has length between 3 and 30 inclusive.

**Validates: Requirements 8.1**

---

### Property 18: Transaction status filter accepts only known status values

*For any* string supplied as `status` in a history query, the validator must accept it if and only if it equals one of `"initiated"`, `"processing"`, `"completed"`, or `"failed"`.

**Validates: Requirements 9.2**

---

### Property 19: Export date range requires startDate ≤ endDate

*For any* pair of ISO 8601 date strings supplied as `startDate` and `endDate`, the validator must reject the pair if `startDate` is strictly after `endDate`, and accept it otherwise.

**Validates: Requirements 9.4**

---

## Error Handling

### Validation errors (HTTP 400)

The `validate` middleware handles all validation failures inline — it never calls `next(err)`. The response shape is always:

```json
{
  "success": false,
  "errors": ["field-level message 1", "field-level message 2"]
}
```

Zod's `safeParse` returns all errors at once, so multi-field failures are reported in a single response. Error messages come from the `message` property of each `ZodIssue` — no path arrays, no type names.

### Non-validation errors

Controllers continue to call `next(error)` for service-layer errors (not found, conflict, etc.), which are handled by the existing `error.middleware.js`. This feature does not change that path.

### Edge cases

- **`z.coerce.number()` on non-numeric strings** — Zod coercion will produce `NaN`, which fails the `.int()` / `.positive()` refinement and returns a 400. No `parseInt` fallback needed.
- **`scheduledAt` in the past** — the `.refine(date > now)` check runs at parse time. Clock skew of a few milliseconds is acceptable; the check uses `>` not `>=`.
- **Empty `events` array** — `.min(1)` on the array catches this before the enum check runs.
- **`startDate` without `endDate` (or vice versa)** — the export schema allows either independently; the cross-field `.refine` only fires when both are present.

---

## Testing Strategy

### Dual approach

Both unit tests and property-based tests are required. They are complementary:

- **Unit tests** cover specific examples, integration points, and error conditions that are hard to express as universal properties (e.g. "the route file wires the validator before the controller").
- **Property tests** verify universal correctness across the full input space — they catch edge cases that hand-written examples miss.

### Property-based testing

**Library**: [`fast-check`](https://github.com/dubzzz/fast-check) — well-maintained, ESM-compatible, works with Node's built-in test runner or Jest/Vitest.

**Configuration**: Each property test runs a minimum of 100 iterations (`numRuns: 100`).

**Tag format** (comment above each test):
```
// Feature: input-validation-hardening, Property <N>: <property_text>
```

Each correctness property above maps to exactly one property-based test. The test generates arbitrary inputs using `fast-check` arbitraries, runs the schema's `safeParse`, and asserts the expected outcome.

**Example structure**:
```js
// Feature: input-validation-hardening, Property 10: Positive-number fields reject zero and negative values
fc.assert(
  fc.property(
    fc.oneof(fc.constant(0), fc.float({ max: -0.001 }), fc.string()),
    (badAmount) => {
      const result = walletOperationSchema.safeParse({ currency: "USD", amount: badAmount });
      return result.success === false;
    }
  ),
  { numRuns: 100 }
);
```

### Unit tests

Unit tests should cover:

- Each validator file: one passing example and one failing example per schema
- The `validate` factory: correct source routing (`body`, `query`, `params`)
- Route integration: confirm validators are wired before controllers (use supertest with a mock controller that records whether it was called)
- Controller cleanup: confirm removed inline checks are gone (read the controller source or use integration tests that send invalid data and expect 400 from the middleware, not the controller)

### Test file locations

```
src/validators/__tests__/
  user.validate.test.js
  webhook.validate.test.js
  spending-limit.validate.test.js
  scheduler.validate.test.js
  payout-user.validate.test.js
  wallet.validate.test.js
  admin.validate.test.js
```
