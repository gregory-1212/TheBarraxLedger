// LED-38: tax-ID crypto + masking unit test.
//
// Plain Node script (like the other __tests__) — `node __tests__/tax-id.test.mjs`.
// Self-contained: sets a throwaway key so it runs without .env.local. getKey()
// in utils/tax-id reads the env lazily (per call), so setting it here is enough.

process.env.TAX_ID_ENCRYPTION_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"; // 64 hex = 32 bytes

const {
  encryptTaxId,
  decryptTaxId,
  maskTaxId,
  normalizeTaxId,
  isValidTaxId,
} = await import("../utils/tax-id.ts");

let failures = 0;
function assert(cond, msg) {
  if (!cond) {
    failures++;
    console.error(`  ✗ ${msg}`);
  } else {
    console.log(`  ✓ ${msg}`);
  }
}

// Round-trip
const SSN = "123456789";
const ct = encryptTaxId(SSN);
assert(ct.startsWith("\\x"), "ciphertext is bytea hex wire format");
assert(decryptTaxId(ct) === SSN, "decrypt(encrypt(x)) === x");
assert(
  encryptTaxId(SSN) !== encryptTaxId(SSN),
  "random IV → different ciphertext each call (no deterministic leak)",
);
assert(decryptTaxId(ct.slice(2)) === SSN, "decrypt accepts bare hex (no \\x prefix)");

// Normalize + validate
assert(normalizeTaxId("12-3456789") === "123456789", "normalize strips dashes");
assert(normalizeTaxId("123 45 6789") === "123456789", "normalize strips spaces");
assert(isValidTaxId("123456789"), "9 digits is valid");
assert(!isValidTaxId("12345"), "5 digits is invalid");
assert(!isValidTaxId("1234567890"), "10 digits is invalid");

// Mask formats
assert(maskTaxId(SSN, "SSN") === "***-**-6789", "SSN mask ***-**-6789");
assert(maskTaxId("12-3456789", "EIN") === "**-***6789", "EIN mask **-***6789");
assert(maskTaxId(SSN, "") === "•••••6789", "unknown-type mask shows last 4");

// Tamper detection (GCM auth tag)
try {
  const flipped = ct.slice(0, -2) + (ct.slice(-2) === "00" ? "11" : "00");
  decryptTaxId(flipped);
  assert(false, "tampered ciphertext should throw");
} catch {
  assert(true, "tampered ciphertext throws (GCM auth failure)");
}

// Too-short blob
try {
  decryptTaxId("\\xdeadbeef");
  assert(false, "too-short blob should throw");
} catch {
  assert(true, "too-short blob throws");
}

console.log(
  failures === 0
    ? "\nAll tax-id tests passed."
    : `\n${failures} tax-id test(s) FAILED.`,
);
process.exit(failures === 0 ? 0 : 1);
