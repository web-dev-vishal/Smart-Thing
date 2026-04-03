// Run this once to generate PASETO Ed25519 key pairs for your .env file.
// Usage: node scripts/generate-keys.js
//
// Copy the output into your .env file.
// NEVER commit the private keys to source control.

import { generateKeyPairHex } from "../src/services/token.service.js";

async function main() {
    console.log("\n=== PASETO Ed25519 Key Generator ===\n");
    console.log("Generating 3 key pairs (access, refresh, verify)...\n");

    const [access, refresh, verify] = await Promise.all([
        generateKeyPairHex(),
        generateKeyPairHex(),
        generateKeyPairHex(),
    ]);

    console.log("# ── PASETO Keys — paste these into your .env file ──────────────");
    console.log(`PASETO_ACCESS_PRIVATE=${access.privateHex}`);
    console.log(`PASETO_ACCESS_PUBLIC=${access.publicHex}`);
    console.log("");
    console.log(`PASETO_REFRESH_PRIVATE=${refresh.privateHex}`);
    console.log(`PASETO_REFRESH_PUBLIC=${refresh.publicHex}`);
    console.log("");
    console.log(`PASETO_VERIFY_PRIVATE=${verify.privateHex}`);
    console.log(`PASETO_VERIFY_PUBLIC=${verify.publicHex}`);
    console.log("\n# ── Keep private keys SECRET — never commit them ───────────────\n");
}

main().catch((err) => {
    console.error("Key generation failed:", err.message);
    process.exit(1);
});
