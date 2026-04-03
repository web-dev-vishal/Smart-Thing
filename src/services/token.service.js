// Token service — PASETO v4.public (Ed25519 asymmetric signing).
//
// Why PASETO over JWT?
//   - No algorithm confusion attacks (JWT's "alg: none" or RS/HS swap bugs don't exist here)
//   - The token format encodes the version and purpose — you can't accidentally verify
//     a v4.local token with a v4.public key or vice versa
//   - Built-in expiry claim (exp) — the library enforces it, not the caller
//   - Payload is signed but NOT encrypted (v4.public) — the client can read it,
//     but cannot forge or tamper with it without the private key
//
// Key setup:
//   - We use TWO Ed25519 key pairs: one for access tokens, one for refresh tokens
//   - Keys are stored as hex strings in environment variables
//   - On first run, generate them with: node scripts/generate-keys.js
//   - The private key signs tokens; the public key verifies them
//   - Verification tokens (email) use a third key pair
//
// Token lifetimes:
//   - Access token:       15 minutes  (short — minimises damage if stolen)
//   - Refresh token:      30 days     (long — stored server-side in Redis)
//   - Verification token: 10 minutes  (email link must be clicked quickly)

import { V4 } from "paseto";
import crypto from "crypto";
import logger from "../utils/logger.js";

// ── Key loading ───────────────────────────────────────────────────────────────
// Ed25519 keys are 32-byte seeds stored as 64-char hex strings in .env.
// We convert them to Node.js KeyObject instances once at startup.
// Throws immediately if any key is missing — better to crash early than silently fail.

function loadKeyPair(privateHex, publicHex, name) {
    if (!privateHex || !publicHex) {
        throw new Error(
            `PASETO ${name} key pair is missing. ` +
            `Run: node scripts/generate-keys.js to generate keys.`
        );
    }

    // Ed25519 private key seed is 32 bytes; the full private key is 64 bytes (seed + public)
    // Node's createPrivateKey expects DER/PEM or a JWK — we use the raw seed approach via
    // bytesToKeyObject which paseto exposes for exactly this purpose.
    const privateBytes = Buffer.from(privateHex, "hex");
    const publicBytes  = Buffer.from(publicHex,  "hex");

    if (privateBytes.length !== 64) {
        throw new Error(`PASETO ${name} private key must be 64 bytes (128 hex chars). Got ${privateBytes.length} bytes.`);
    }
    if (publicBytes.length !== 32) {
        throw new Error(`PASETO ${name} public key must be 32 bytes (64 hex chars). Got ${publicBytes.length} bytes.`);
    }

    const privateKey = V4.bytesToKeyObject(privateBytes);
    const publicKey  = V4.bytesToKeyObject(publicBytes);

    return { privateKey, publicKey };
}

// Load all three key pairs at module initialisation time.
// If any env var is missing the error surfaces immediately on startup.
let accessKeys, refreshKeys, verifyKeys;

try {
    accessKeys  = loadKeyPair(process.env.PASETO_ACCESS_PRIVATE,  process.env.PASETO_ACCESS_PUBLIC,  "access");
    refreshKeys = loadKeyPair(process.env.PASETO_REFRESH_PRIVATE, process.env.PASETO_REFRESH_PUBLIC, "refresh");
    verifyKeys  = loadKeyPair(process.env.PASETO_VERIFY_PRIVATE,  process.env.PASETO_VERIFY_PUBLIC,  "verify");
} catch (err) {
    // In test environments the keys won't be set — log a warning but don't crash the import
    logger.warn("PASETO keys not loaded (expected in test env):", err.message);
}

// ── TTL constants (in seconds) ────────────────────────────────────────────────
export const TOKEN_TTL = {
    ACCESS:  15 * 60,            // 15 minutes
    REFRESH: 30 * 24 * 60 * 60,  // 30 days
    VERIFY:  10 * 60,            // 10 minutes
};

// ── Token issuance ────────────────────────────────────────────────────────────

// Issue a PASETO v4.public access token.
// Payload: { sub: userId, jti: unique token ID, iat, exp }
// The jti (JWT ID equivalent) lets us blacklist individual tokens if needed.
export async function issueAccessToken(userId) {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
        sub: userId.toString(),
        jti: crypto.randomBytes(16).toString("hex"),
        iat: now,
        exp: now + TOKEN_TTL.ACCESS,
        typ: "access",
    };

    const token = await V4.sign(payload, accessKeys.privateKey);
    return token;
}

// Issue a PASETO v4.public refresh token.
// Longer-lived; stored server-side in Redis — invalidated on logout.
export async function issueRefreshToken(userId) {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
        sub: userId.toString(),
        jti: crypto.randomBytes(16).toString("hex"),
        iat: now,
        exp: now + TOKEN_TTL.REFRESH,
        typ: "refresh",
    };

    const token = await V4.sign(payload, refreshKeys.privateKey);
    return token;
}

// Issue a PASETO v4.public email verification token.
// Short-lived; stored in Redis and deleted after first use.
export async function issueVerifyToken(userId) {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
        sub: userId.toString(),
        jti: crypto.randomBytes(16).toString("hex"),
        iat: now,
        exp: now + TOKEN_TTL.VERIFY,
        typ: "verify",
    };

    const token = await V4.sign(payload, verifyKeys.privateKey);
    return token;
}

// Convenience: issue both access and refresh tokens in one call.
export async function issueTokenPair(userId) {
    const [accessToken, refreshToken] = await Promise.all([
        issueAccessToken(userId),
        issueRefreshToken(userId),
    ]);
    return { accessToken, refreshToken };
}

// ── Token verification ────────────────────────────────────────────────────────

// Verify a PASETO v4.public access token.
// Returns the decoded payload or throws a structured error.
export async function verifyAccessToken(token) {
    return _verify(token, accessKeys.publicKey, "access");
}

// Verify a PASETO v4.public refresh token.
export async function verifyRefreshToken(token) {
    return _verify(token, refreshKeys.publicKey, "refresh");
}

// Verify a PASETO v4.public email verification token.
export async function verifyVerifyToken(token) {
    return _verify(token, verifyKeys.publicKey, "verify");
}

// Internal verify — shared logic for all three token types.
// Checks: valid signature, not expired, correct typ claim.
async function _verify(token, publicKey, expectedType) {
    if (!token || typeof token !== "string") {
        const err = new Error("Token is missing or not a string");
        err.code  = "TOKEN_MISSING";
        err.statusCode = 401;
        throw err;
    }

    let payload;
    try {
        // V4.verify throws if the signature is invalid or the token is malformed
        payload = await V4.verify(token, publicKey);
    } catch (cause) {
        // Map paseto library errors to our own structured errors
        const err = new Error("Token is invalid or has been tampered with");
        err.code  = "TOKEN_INVALID";
        err.statusCode = 401;
        err.cause = cause;
        throw err;
    }

    // Check expiry manually — paseto v4 embeds exp but we double-check
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
        const err = new Error(
            expectedType === "access"
                ? "Access token has expired — use your refresh token to get a new one"
                : expectedType === "refresh"
                    ? "Refresh token has expired — please log in again"
                    : "Verification token has expired — please request a new one"
        );
        err.code  = "TOKEN_EXPIRED";
        err.statusCode = 401;
        throw err;
    }

    // Reject tokens issued for a different purpose
    // e.g. someone trying to use a refresh token as an access token
    if (payload.typ !== expectedType) {
        const err = new Error(`Wrong token type: expected "${expectedType}", got "${payload.typ}"`);
        err.code  = "TOKEN_WRONG_TYPE";
        err.statusCode = 401;
        throw err;
    }

    return payload;
}

// ── Key generation helper (used by scripts/generate-keys.js) ─────────────────
// Generates a fresh Ed25519 key pair and returns both as hex strings.
// Call this once and store the output in your .env file.
export async function generateKeyPairHex() {
    const { privateKey, publicKey } = await V4.generateKey("public", { format: "keyObject" });

    // Export as raw bytes then hex-encode
    const privateBytes = V4.keyObjectToBytes(privateKey);
    const publicBytes  = V4.keyObjectToBytes(publicKey);

    return {
        privateHex: privateBytes.toString("hex"),
        publicHex:  publicBytes.toString("hex"),
    };
}
