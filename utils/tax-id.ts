// LED-38: app-layer encryption + masking for vendor TINs (SSN / EIN).
//
// Storage: vendors.tax_id_encrypted (bytea). The stored blob is
//   iv(12) || authTag(16) || ciphertext,  AES-256-GCM, key = TAX_ID_ENCRYPTION_KEY.
// Plaintext is the normalized 9-digit TIN (digits only — the IRS IRIS format
// wants raw digits; masking derives the dashed format from the vendor's TIN type).
//
// PostgREST represents bytea as a hex string ("\\x...") on BOTH read and write,
// so encryptTaxId() returns that wire format directly and decryptTaxId() accepts
// it. (Verified end-to-end against PostgREST in LED-38 dev — see commit notes.)
//
// SERVER-ONLY: uses node:crypto and the secret key. Never import into a client
// component. The reveal route, the vendor detail server component (mask only),
// and the year-end export are the only callers.

import crypto from "crypto";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

function getKey(): Buffer {
  const raw = process.env.TAX_ID_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "TAX_ID_ENCRYPTION_KEY is not set — tax-ID encryption is unavailable. " +
        "Set it in .env.local (local) and the Ledger Vercel env (production); " +
        "the SAME value must be used in both since they share one database.",
    );
  }
  // Accept 64-char hex (preferred) or base64; must decode to exactly 32 bytes.
  const key = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, "hex")
    : Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      `TAX_ID_ENCRYPTION_KEY must decode to 32 bytes (got ${key.length}). ` +
        "Use 64 hex chars or a 32-byte base64 string.",
    );
  }
  return key;
}

/** Strip everything but digits. Accepts messy input ("12-3456789", "123 45 6789"). */
export function normalizeTaxId(raw: string): string {
  return (raw ?? "").replace(/\D/g, "");
}

/** SSN and EIN are both exactly 9 digits. */
export function isValidTaxId(normalized: string): boolean {
  return /^\d{9}$/.test(normalized);
}

/**
 * Encrypt a TIN. Pass an already-normalized 9-digit string.
 * Returns the PostgREST bytea wire format ("\\x<hex>") ready to store.
 */
export function encryptTaxId(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  const blob = Buffer.concat([iv, tag, ciphertext]);
  return "\\x" + blob.toString("hex");
}

/**
 * Decrypt a stored TIN. Accepts the PostgREST bytea wire format ("\\x<hex>"),
 * bare hex, or a raw Buffer. Returns the plaintext (normalized 9-digit) string.
 * Throws on a corrupt/forged blob (GCM auth failure).
 */
export function decryptTaxId(stored: string | Buffer): string {
  const key = getKey();
  let blob: Buffer;
  if (Buffer.isBuffer(stored)) {
    blob = stored;
  } else if (typeof stored === "string" && stored.startsWith("\\x")) {
    blob = Buffer.from(stored.slice(2), "hex");
  } else if (typeof stored === "string") {
    blob = Buffer.from(stored, "hex"); // defensive: some drivers drop the prefix
  } else {
    throw new Error("decryptTaxId: unrecognized ciphertext format");
  }
  if (blob.length < IV_BYTES + TAG_BYTES + 1) {
    throw new Error("decryptTaxId: ciphertext too short / corrupt");
  }
  const iv = blob.subarray(0, IV_BYTES);
  const tag = blob.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = blob.subarray(IV_BYTES + TAG_BYTES);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}

/**
 * Mask a TIN for default display. The format follows the vendor's TIN type:
 *   SSN     -> ***-**-1234
 *   EIN     -> **-***1234
 *   unknown -> •••••1234
 * Always shows only the last 4 digits.
 */
export function maskTaxId(
  plaintext: string,
  tinType: "EIN" | "SSN" | "" | null | undefined,
): string {
  const last4 = normalizeTaxId(plaintext).slice(-4);
  if (tinType === "SSN") return `***-**-${last4}`;
  if (tinType === "EIN") return `**-***${last4}`;
  return `•••••${last4}`;
}
