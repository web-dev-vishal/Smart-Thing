// Shared constants used across the codebase.
// Centralizing them here eliminates duplication and ensures consistency.

// All currencies supported for payouts — used by models, validators, and services.
export const SUPPORTED_CURRENCIES = [
    "USD", "EUR", "GBP", "INR", "CAD", "AUD", "JPY", "CHF",
    "CNY", "MXN", "BRL", "ZAR", "SGD", "HKD", "NZD", "SEK",
    "NOK", "DKK", "PLN", "THB", "KRW", "RUB", "TRY", "IDR",
    "MYR", "PHP", "VND", "AED", "SAR", "EGP",
];

// All webhook event types covering the full payout lifecycle — used by webhook models and services.
export const WEBHOOK_EVENTS = [
    "payout.initiated",
    "payout.processing",
    "payout.completed",
    "payout.failed",
    "payout.cancelled",
];
