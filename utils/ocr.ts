// OCR core — Claude vision extraction for receipts (LED-23) and the documents
// archive (LED-55). Shared engine; callers (upload pipeline, OCR cron) live in
// their own issues. Uses the Anthropic Messages REST API directly (no SDK), the
// same "REST wrapper, graceful-skip if key unset" pattern as utils/send-email.ts.
//
// Key: ANTHROPIC_API_KEY (Codespace secret locally; Vercel env in prod).
//
// Media: images (jpeg/png/webp/gif) use an `image` content block; PDFs use a
// `document` block. The modern Anthropic API accepts PDFs natively, so LED-55's
// old "Claude Vision can't take PDF, convert to image first" note is no longer
// needed — no pdf-to-image dependency.
//
// SERVER-ONLY: never import into a client component (uses the secret key).

const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

// Haiku 4.5 is vision-capable and cheap — right for simple receipts/documents.
// Bump to a Sonnet model here if extraction quality on messy receipts proves
// insufficient (cost vs. accuracy trade-off; flagged for Greg in the proposal).
export const OCR_MODEL = "claude-haiku-4-5-20251001";

export type OcrMediaType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/gif"
  | "application/pdf";

const IMAGE_TYPES: OcrMediaType[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

export function isSupportedOcrType(t: string): t is OcrMediaType {
  return (IMAGE_TYPES as string[]).includes(t) || t === "application/pdf";
}

export type ReceiptExtraction = {
  vendorName: string | null;
  date: string | null; // ISO YYYY-MM-DD
  totalCents: number | null; // cents — matches the Ledger amount_cents convention
  taxCents: number | null;
  paymentMethod: string | null; // e.g. "Visa ****1234"
  lineItems: { description: string; amountCents: number }[];
  // Per-field 0..1 confidence — drives LED-48's auto-confirm thresholds.
  confidence: Record<string, number>;
  raw: string; // raw model text, kept for debugging / audit
};

type Ok<T> = { ok: true; data: T };
type Skipped = { ok: false; skipped: true; reason: string };
type Failed = { ok: false; skipped: false; error: string; status?: number };
export type OcrResult<T> = Ok<T> | Skipped | Failed;

// Build the content block for the file (image vs. PDF).
function fileBlock(base64Data: string, mediaType: OcrMediaType) {
  if (mediaType === "application/pdf") {
    return {
      type: "document" as const,
      source: { type: "base64" as const, media_type: mediaType, data: base64Data },
    };
  }
  return {
    type: "image" as const,
    source: { type: "base64" as const, media_type: mediaType, data: base64Data },
  };
}

// Low-level call: send a file + instruction, return the model's text.
async function callClaude(
  base64Data: string,
  mediaType: OcrMediaType,
  instruction: string,
  maxTokens: number,
): Promise<OcrResult<string>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("[ocr] ANTHROPIC_API_KEY not set — skipping OCR");
    return { ok: false, skipped: true, reason: "ANTHROPIC_API_KEY not set" };
  }
  if (!isSupportedOcrType(mediaType)) {
    return { ok: false, skipped: false, error: `unsupported media type: ${mediaType}` };
  }

  let resp: Response;
  try {
    resp = await fetch(ANTHROPIC_ENDPOINT, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: OCR_MODEL,
        max_tokens: maxTokens,
        messages: [
          {
            role: "user",
            content: [
              fileBlock(base64Data, mediaType),
              { type: "text", text: instruction },
            ],
          },
        ],
      }),
    });
  } catch (e) {
    return { ok: false, skipped: false, error: `network: ${(e as Error).message}` };
  }

  if (!resp.ok) {
    let errBody = "";
    try {
      errBody = await resp.text();
    } catch {
      /* ignore */
    }
    return {
      ok: false,
      skipped: false,
      error: `anthropic ${resp.status}: ${errBody.slice(0, 300)}`,
      status: resp.status,
    };
  }

  const json = (await resp.json().catch(() => ({}))) as {
    content?: { type: string; text?: string }[];
  };
  const text =
    (json.content ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("")
      .trim() || "";
  return { ok: true, data: text };
}

const RECEIPT_INSTRUCTION = `You are extracting structured data from a receipt image. Return ONLY a JSON object, no prose, no markdown fences. Use this exact shape:
{
  "vendor_name": string|null,
  "date": string|null,            // ISO "YYYY-MM-DD"; null if not visible
  "total_cents": integer|null,    // grand total in CENTS (e.g. $12.34 -> 1234)
  "tax_cents": integer|null,      // tax in CENTS, separate from total; null if none
  "payment_method": string|null,  // e.g. "Visa ****1234", "Cash"; null if unknown
  "line_items": [ { "description": string, "amount_cents": integer } ],
  "confidence": {                 // your 0..1 confidence PER FIELD
    "vendor_name": number, "date": number, "total_cents": number,
    "tax_cents": number, "payment_method": number
  }
}
All money is integer cents — never dollars, never strings. If a field is illegible or absent, use null and set its confidence to 0.`;

/**
 * Extract structured receipt data from an image or PDF (base64). Money is
 * returned in cents. Confidence is per-field for LED-48's auto-confirm policy.
 */
export async function extractReceiptData(
  base64Data: string,
  mediaType: OcrMediaType,
): Promise<OcrResult<ReceiptExtraction>> {
  const res = await callClaude(base64Data, mediaType, RECEIPT_INSTRUCTION, 1500);
  if (!res.ok) return res;
  const data = parseReceiptText(res.data);
  if (!data) {
    return { ok: false, skipped: false, error: "could not parse OCR JSON response" };
  }
  return { ok: true, data };
}

/**
 * Pure parser: model text (raw JSON, optionally ```json-fenced or wrapped in
 * prose) -> ReceiptExtraction. Exported so it can be unit-tested without an
 * API call. Returns null if no JSON object can be recovered.
 */
export function parseReceiptText(text: string): ReceiptExtraction | null {
  const parsed = parseJsonObject(text);
  if (!parsed) return null;

  const ci = (parsed.confidence ?? {}) as Record<string, unknown>;
  return {
    vendorName: strOrNull(parsed.vendor_name),
    date: strOrNull(parsed.date),
    totalCents: intOrNull(parsed.total_cents),
    taxCents: intOrNull(parsed.tax_cents),
    paymentMethod: strOrNull(parsed.payment_method),
    lineItems: Array.isArray(parsed.line_items)
      ? (parsed.line_items as unknown[]).flatMap((li) => {
          const o = li as Record<string, unknown>;
          const amt = intOrNull(o.amount_cents);
          const desc = strOrNull(o.description);
          return desc !== null && amt !== null
            ? [{ description: desc, amountCents: amt }]
            : [];
        })
      : [],
    confidence: {
      vendor_name: numOr0(ci.vendor_name),
      date: numOr0(ci.date),
      total_cents: numOr0(ci.total_cents),
      tax_cents: numOr0(ci.tax_cents),
      payment_method: numOr0(ci.payment_method),
    },
    raw: text,
  };
}

const DOCUMENT_TEXT_INSTRUCTION = `Transcribe ALL readable text in this document exactly, top to bottom. Return only the plain text — no commentary, no markdown. Preserve numbers and names verbatim. This text feeds a full-text search index.`;

/**
 * Extract plain text from a document image or PDF (base64) for the documents
 * archive search index (LED-55 writes this into documents.ocr_text).
 */
export async function extractDocumentText(
  base64Data: string,
  mediaType: OcrMediaType,
): Promise<OcrResult<string>> {
  return callClaude(base64Data, mediaType, DOCUMENT_TEXT_INSTRUCTION, 4096);
}

// ── parse helpers ─────────────────────────────────────────────────────────

// Pull the first balanced {...} JSON object out of a model response. Tolerates
// stray prose or ```json fences even though we asked for none.
function parseJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function strOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s === "" ? null : s;
}

function intOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  return null;
}

function numOr0(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}
