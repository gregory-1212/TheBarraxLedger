// OCR receipt-parser unit test (LED-23 core). Pure — no API call.
// `node __tests__/ocr.test.mjs`. Locks down the model-text -> structured
// extraction: fence/prose tolerance, cents preserved as integers, missing
// fields -> null + 0 confidence, malformed -> null, bad line items dropped.

const { parseReceiptText } = await import("../utils/ocr.ts");

let failures = 0;
function assert(cond, msg) {
  if (!cond) {
    failures++;
    console.error(`  ✗ ${msg}`);
  } else {
    console.log(`  ✓ ${msg}`);
  }
}

const FULL = {
  vendor_name: "Music City Hardware",
  date: "2026-05-28",
  total_cents: 11907,
  tax_cents: 1008,
  payment_method: "Visa ****4242",
  line_items: [
    { description: "Steel padlock 2-pk", amount_cents: 1899 },
    { description: "bad item, no amount" }, // should be dropped
  ],
  confidence: { vendor_name: 0.99, date: 0.9, total_cents: 0.95 },
};

// 1. ```json-fenced (what Claude actually returned in the live test)
const fenced = "```json\n" + JSON.stringify(FULL) + "\n```";
const a = parseReceiptText(fenced);
assert(a !== null, "parses ```json-fenced output");
assert(a.vendorName === "Music City Hardware", "vendor extracted");
assert(a.totalCents === 11907 && Number.isInteger(a.totalCents), "total stays integer cents");
assert(a.taxCents === 1008, "tax in cents");
assert(a.paymentMethod === "Visa ****4242", "payment method extracted");
assert(a.lineItems.length === 1, "line item missing amount is dropped");
assert(a.lineItems[0].amountCents === 1899, "valid line item kept (cents)");
assert(a.confidence.vendor_name === 0.99, "confidence carried through");
assert(a.confidence.payment_method === 0, "missing confidence defaults to 0");

// 2. Prose-wrapped JSON
const prose = "Sure! Here is the data:\n" + JSON.stringify(FULL) + "\nLet me know if you need more.";
assert(parseReceiptText(prose)?.totalCents === 11907, "parses JSON wrapped in prose");

// 3. Missing fields -> null
const sparse = parseReceiptText('{"vendor_name":"X"}');
assert(sparse !== null, "parses sparse object");
assert(sparse.date === null && sparse.totalCents === null, "absent fields -> null");
assert(sparse.lineItems.length === 0, "absent line_items -> []");
assert(sparse.confidence.total_cents === 0, "absent confidence -> 0");

// 4. Malformed / no JSON -> null
assert(parseReceiptText("not json at all") === null, "no JSON object -> null");
assert(parseReceiptText("{ broken: ") === null, "broken JSON -> null");

// 5. Dollars-as-string must NOT be coerced to a number (guards money math)
const stringy = parseReceiptText('{"total_cents":"11907"}');
assert(stringy.totalCents === null, "string total_cents rejected (not silently cast)");

console.log(
  failures === 0 ? "\nAll OCR parser tests passed." : `\n${failures} OCR test(s) FAILED.`,
);
process.exit(failures === 0 ? 0 : 1);
