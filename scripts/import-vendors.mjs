// Imports Julie's existing vendor list (CSV) into the vendors table. LED-16.
//
// Usage:
//   node scripts/import-vendors.mjs <csv-file> [--dry-run]
//   node scripts/import-vendors.mjs ~/Downloads/vendors.csv --dry-run
//
// Design notes:
// - Idempotent: matches existing vendors by lower(name) and SKIPS them, so
//   re-running never double-creates. It does NOT update existing rows (that
//   could clobber Julie's manual edits); it only inserts genuinely-new vendors.
// - RFC-4180 CSV parsing (quoted fields, embedded commas/newlines, "" escapes)
//   because spreadsheet exports put addresses with commas in quotes. Also strips
//   a UTF-8 BOM, which Excel/Numbers prepend.
// - Header-driven, alias-tolerant column mapping: Julie's columns can be named
//   "Vendor", "Vendor Name", "Company", etc. Only `name` is required.
// - Parameterized inserts via pg — no string-built SQL.

import pg from "pg";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---- args -----------------------------------------------------------------
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const csvArg = args.find((a) => !a.startsWith("--"));

if (!csvArg) {
  console.error("Usage: node scripts/import-vendors.mjs <csv-file> [--dry-run]");
  process.exit(1);
}

const csvPath = resolve(process.cwd(), csvArg);

// ---- env (mirror run-ddl.mjs) ---------------------------------------------
const envPath = resolve(__dirname, "../.env.local");
const envText = readFileSync(envPath, "utf-8");
const env = {};
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.+)$/);
  if (m) env[m[1]] = m[2].trim();
}
const url = new URL(env.NEXT_PUBLIC_SUPABASE_URL);
const projectRef = url.hostname.split(".")[0];

// ---- CSV parser (RFC 4180) ------------------------------------------------
// Returns an array of rows, each an array of string cells. Handles quoted
// fields, commas + newlines inside quotes, and "" as an escaped quote.
function parseCsv(text) {
  // Strip UTF-8 BOM if present.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'; // escaped quote
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        field += ch;
        i++;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i++;
    } else if (ch === ",") {
      row.push(field);
      field = "";
      i++;
    } else if (ch === "\r") {
      // swallow; handled by the \n that follows (or end of file)
      i++;
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
    } else {
      field += ch;
      i++;
    }
  }
  // flush trailing field/row (file without final newline)
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// ---- column mapping -------------------------------------------------------
// field -> list of accepted header aliases (compared case-insensitively, with
// non-alphanumerics stripped so "Vendor Name", "vendor_name", "VendorName" all match).
const FIELD_ALIASES = {
  name: ["name", "vendor", "vendorname", "company", "companyname", "payee"],
  dba: ["dba", "doingbusinessas", "alias"],
  vendor_type: ["type", "vendortype", "category", "kind"],
  contact_name: ["contact", "contactname", "contactperson"],
  contact_email: ["email", "contactemail", "emailaddress"],
  contact_phone: ["phone", "contactphone", "phonenumber", "tel", "telephone"],
  billing_address: ["address", "billingaddress", "mailingaddress"],
  payment_method: ["paymentmethod", "payment", "howpaid", "paidvia"],
  default_expense_category: ["expensecategory", "defaultexpensecategory", "glcategory", "expense"],
  is_1099_eligible: ["1099", "is1099", "1099eligible", "is1099eligible", "contractor1099"],
  notes: ["notes", "note", "comments", "memo"],
};

function normHeader(h) {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function buildColumnMap(headerRow) {
  const normed = headerRow.map(normHeader);
  const map = {};
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    const idx = normed.findIndex((h) => aliases.includes(h));
    if (idx !== -1) map[field] = idx;
  }
  return map;
}

// ---- value normalizers ----------------------------------------------------
const VENDOR_TYPES = ["subscription", "utility", "contractor", "supplier", "government", "other"];

function normalizeVendorType(raw) {
  if (!raw) return "other";
  const v = raw.toLowerCase().trim();
  if (VENDOR_TYPES.includes(v)) return v;
  if (/^subs?(cription)?$/.test(v) || v.includes("subscription")) return "subscription";
  if (v.includes("utilit")) return "utility";
  if (v.includes("contractor") || v.includes("1099")) return "contractor";
  if (v.includes("supplier") || v.includes("goods") || v.includes("material")) return "supplier";
  if (v.includes("gov") || v.includes("tax")) return "government";
  return "other";
}

function parseBoolean(raw) {
  if (!raw) return false;
  return /^(y|yes|true|1|x)$/i.test(raw.trim());
}

function clean(raw) {
  if (raw === undefined || raw === null) return null;
  const t = raw.trim();
  return t.length ? t : null;
}

// ---- main -----------------------------------------------------------------
const fileText = readFileSync(csvPath, "utf-8");
const allRows = parseCsv(fileText).filter((r) => r.some((c) => c.trim().length > 0));

if (allRows.length < 2) {
  console.error("CSV has no data rows (need a header row + at least one vendor).");
  process.exit(1);
}

const headerRow = allRows[0];
const colMap = buildColumnMap(headerRow);

if (colMap.name === undefined) {
  console.error(
    `Could not find a vendor-name column. Headers seen: ${headerRow.join(", ")}\n` +
      `Rename the name column to one of: ${FIELD_ALIASES.name.join(", ")}`,
  );
  process.exit(1);
}

// Build vendor objects from data rows, de-duping by name within the file too.
const seenInFile = new Set();
const parsed = [];
const fileDupes = [];
const blankNames = [];

for (let r = 1; r < allRows.length; r++) {
  const cells = allRows[r];
  const get = (field) => (colMap[field] !== undefined ? clean(cells[colMap[field]]) : null);

  const name = get("name");
  if (!name) {
    blankNames.push(r + 1); // 1-based line number for the human
    continue;
  }
  const key = name.toLowerCase();
  if (seenInFile.has(key)) {
    fileDupes.push(name);
    continue;
  }
  seenInFile.add(key);

  parsed.push({
    name,
    dba: get("dba"),
    vendor_type: normalizeVendorType(get("vendor_type")),
    contact_name: get("contact_name"),
    contact_email: get("contact_email"),
    contact_phone: get("contact_phone"),
    billing_address: get("billing_address"),
    payment_method: get("payment_method"),
    default_expense_category: get("default_expense_category"),
    is_1099_eligible: colMap.is_1099_eligible !== undefined ? parseBoolean(get("is_1099_eligible")) : false,
    notes: get("notes"),
  });
}

console.log(`Parsed ${parsed.length} unique vendor row(s) from ${csvArg}`);
console.log(`Column mapping: ${JSON.stringify(colMap)}`);
if (blankNames.length) console.log(`Skipped ${blankNames.length} row(s) with a blank name (lines: ${blankNames.join(", ")})`);
if (fileDupes.length) console.log(`Skipped ${fileDupes.length} duplicate name(s) within the file: ${fileDupes.join(", ")}`);

// ---- connect + load existing ----------------------------------------------
const client = new pg.Client({
  host: "aws-1-us-east-1.pooler.supabase.com",
  port: 5432,
  database: "postgres",
  user: `postgres.${projectRef}`,
  password: env.SUPABASE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

await client.connect();

try {
  const existing = await client.query(
    "SELECT lower(name) AS lname FROM public.vendors WHERE deleted_at IS NULL",
  );
  const existingNames = new Set(existing.rows.map((row) => row.lname));

  const toInsert = parsed.filter((v) => !existingNames.has(v.name.toLowerCase()));
  const skipped = parsed.filter((v) => existingNames.has(v.name.toLowerCase()));

  console.log(`\n${existingNames.size} vendor(s) already in the DB.`);
  if (skipped.length) console.log(`Skipping ${skipped.length} already-present: ${skipped.map((v) => v.name).join(", ")}`);
  console.log(`${toInsert.length} new vendor(s) to insert.\n`);

  if (toInsert.length === 0) {
    console.log("Nothing to insert. Done.");
    process.exit(0);
  }

  if (dryRun) {
    console.log("DRY RUN — no rows written. Would insert:");
    for (const v of toInsert) {
      console.log(`  • ${v.name}  [${v.vendor_type}]${v.contact_email ? `  <${v.contact_email}>` : ""}`);
    }
    console.log(`\n(${toInsert.length} vendor(s). Re-run without --dry-run to write.)`);
    process.exit(0);
  }

  let inserted = 0;
  for (const v of toInsert) {
    await client.query(
      `INSERT INTO public.vendors
         (name, dba, vendor_type, contact_name, contact_email, contact_phone,
          billing_address, payment_method, default_expense_category,
          is_1099_eligible, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        v.name,
        v.dba,
        v.vendor_type,
        v.contact_name,
        v.contact_email,
        v.contact_phone,
        v.billing_address,
        v.payment_method,
        v.default_expense_category,
        v.is_1099_eligible,
        v.notes,
      ],
    );
    inserted++;
    console.log(`  inserted: ${v.name}`);
  }
  console.log(`\nDone. Inserted ${inserted} vendor(s).`);
} catch (err) {
  console.error("\nImport failed:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
