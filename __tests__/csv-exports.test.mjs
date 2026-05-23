// LED-53: CSV export format-invariant contract test.
//
// Locks down the IRIS 1099-NEC CSV builder so future changes can't silently
// break the CPA's filing tool. Runs the pure builder helper on synthetic
// fixtures and asserts every invariant from the issue.
//
// Deliberately written as a plain Node script (`node __tests__/...`) instead
// of vitest/jest. The Ledger has no test framework yet — picking one is a
// project-wide decision that deserves Greg's input. Until then, this script
// runs on demand (`npm run test:csv`) and can be moved into a proper runner
// later without changing its assertions.

import {
  buildIris1099NecCsv,
  centsToIrisAmount,
  IRIS_1099_NEC_COLUMNS,
} from "../utils/iris-1099-nec.ts";
import {
  buildCategorizedExpenseCsv,
  centsToCsvDollars,
  CATEGORIZED_EXPENSE_COLUMNS,
} from "../utils/categorized-expense-csv.ts";

let failures = 0;
function assert(cond, msg) {
  if (!cond) {
    failures++;
    console.error(`  ✗ ${msg}`);
  } else {
    console.log(`  ✓ ${msg}`);
  }
}
function section(name) {
  console.log(`\n${name}`);
}

const payer = {
  name: "The Barrax LLC",
  tin: "12-3456789",
  addressLine1: "123 Main St",
  addressLine2: "Suite 4",
  city: "Nashville",
  state: "TN",
  zip: "37203",
  countryCode: "US",
  phone: "615-555-0100",
};

// Fixtures cover the hard cases: commas in names, embedded quotes, newlines,
// negative amounts, zero, large totals.
const recipients = [
  {
    name: "Acme, Inc.", // comma in name → must be quoted
    nameLine2: "",
    tin: "98-7654321",
    tinType: "EIN",
    addressLine1: 'PO Box "9"', // embedded quote → must double the quote
    addressLine2: "",
    city: "Memphis",
    state: "TN",
    zip: "38103",
    countryCode: "US",
    accountNumber: "vendor-uuid-1",
    nonemployeeCompensation: centsToIrisAmount(123456),
    federalIncomeTaxWithheld: centsToIrisAmount(0),
    directSalesIndicator: false,
    secondTinNotice: false,
    fatcaFilingRequirement: false,
  },
  {
    name: "Adam Smith",
    nameLine2: "Adam Smith Marketing",
    tin: "",
    tinType: "SSN",
    addressLine1: "456 Oak Ave\nApt 2", // newline → must be quoted
    addressLine2: "",
    city: "Nashville",
    state: "TN",
    zip: "37204",
    countryCode: "US",
    accountNumber: "vendor-uuid-2",
    nonemployeeCompensation: centsToIrisAmount(280000),
    federalIncomeTaxWithheld: centsToIrisAmount(0),
    directSalesIndicator: false,
    secondTinNotice: false,
    fatcaFilingRequirement: false,
  },
];

const csv = buildIris1099NecCsv(2026, payer, recipients);

section("Encoding + line endings");
assert(!csv.startsWith("﻿"), "no UTF-8 BOM at the start");
// Bare \r is forbidden; only LF inside quoted fields is allowed (the
// recipient-2 fixture has a quoted \n in the address).
assert(!/\r/.test(csv), "no CR characters (LF line endings only, never CRLF)");
assert(
  Buffer.from(csv, "utf-8").toString("utf-8") === csv,
  "round-trips through UTF-8 unchanged",
);

section("Header + row count");
// Parse the whole CSV at once so quoted newlines in addresses don't break
// row boundaries. parseCsvAll returns rows of cells.
const allRows = parseCsvAll(csv);
const headerCells = allRows[0];
const dataRows = allRows.slice(1);

assert(
  headerCells.length === IRIS_1099_NEC_COLUMNS.length,
  `header has ${IRIS_1099_NEC_COLUMNS.length} columns (saw ${headerCells.length})`,
);
const headerMatches = IRIS_1099_NEC_COLUMNS.every(
  (col, i) => headerCells[i] === col,
);
assert(headerMatches, "header column order matches IRIS_1099_NEC_COLUMNS");

assert(
  dataRows.length === recipients.length,
  `produces 1 header + ${recipients.length} data rows (saw ${dataRows.length} data rows)`,
);

section("RFC 4180 quoting");
assert(
  /"Acme, Inc\."/.test(csv),
  'comma-bearing field "Acme, Inc." is quoted',
);
assert(
  /"PO Box ""9"""/.test(csv),
  'embedded quotes in "PO Box \\"9\\"" are doubled and the field is wrapped',
);
assert(
  /"456 Oak Ave\nApt 2"/.test(csv),
  "newline-bearing address is wrapped in quotes",
);

section("Amount column format");
const allRowCells = dataRows;
const colIdx = (name) => IRIS_1099_NEC_COLUMNS.indexOf(name);
const amountColumns = [
  "Box 1 Nonemployee Compensation",
  "Box 4 Federal Income Tax Withheld",
  "State Tax Withheld",
  "State Income",
];
const amountPattern = /^-?\d+\.\d{2}$|^$/;
for (const col of amountColumns) {
  const idx = colIdx(col);
  assert(idx >= 0, `column "${col}" exists`);
  for (let r = 0; r < allRowCells.length; r++) {
    const val = allRowCells[r][idx];
    assert(
      amountPattern.test(val),
      `row ${r + 1} "${col}" = ${JSON.stringify(val)} matches /^-?\\d+\\.\\d{2}$/ or empty`,
    );
    assert(!val.includes("$"), `row ${r + 1} "${col}" contains no $`);
    assert(
      !/,\d{3}/.test(val),
      `row ${r + 1} "${col}" uses no thousands separator`,
    );
    assert(
      !/^\(.*\)$/.test(val),
      `row ${r + 1} "${col}" uses leading "-" for negatives, not "()"`,
    );
  }
}

section("Tax Year column");
const taxYearIdx = colIdx("Tax Year");
for (let r = 0; r < allRowCells.length; r++) {
  assert(
    /^\d{4}$/.test(allRowCells[r][taxYearIdx]),
    `row ${r + 1} Tax Year is a 4-digit year (saw ${JSON.stringify(allRowCells[r][taxYearIdx])})`,
  );
}

section("Round-trip parsing");
// Build, parse back, build again — must be byte-identical.
const rebuilt = allRows.map(serializeCsvRow).join("\n");
assert(rebuilt === csv, "build → parse → build round-trips byte-for-byte");

section("centsToIrisAmount edge cases");
assert(centsToIrisAmount(0) === "0.00", "0 cents → 0.00");
assert(centsToIrisAmount(99) === "0.99", "99 cents → 0.99");
assert(centsToIrisAmount(100) === "1.00", "100 cents → 1.00");
assert(centsToIrisAmount(123456) === "1234.56", "123456 cents → 1234.56");
assert(centsToIrisAmount(-50) === "-0.50", "-50 cents → -0.50 (sign prefix)");
assert(
  centsToIrisAmount(1_000_000_00) === "1000000.00",
  "$1M renders with no thousands separator",
);

// ==========================================================================
// LED-32: categorized-expense CSV contract.
// ==========================================================================

section("[Categorized Expenses] encoding + header");
const catRows = [
  {
    paidDate: "2026-03-15",
    vendorName: "Acme, Inc.",
    categoryName: "Software / SaaS",
    taxTreatment: "deductible",
    amountDollars: centsToCsvDollars(12999),
    paymentMethod: "Visa ending 1234",
    receipt: "in archive",
    reference: "INV-001",
    notes: 'Annual plan; "renew Q1"',
  },
  {
    paidDate: "2026-04-01",
    vendorName: "Eric Arnsberger",
    categoryName: "Contractor Pay",
    taxTreatment: "deductible",
    amountDollars: centsToCsvDollars(280000),
    paymentMethod: "ACH",
    receipt: "",
    reference: "",
    notes: "Multi-line\nnote",
  },
  {
    paidDate: "2026-05-23",
    vendorName: "Mystery Refund",
    categoryName: "Other",
    taxTreatment: "deductible",
    amountDollars: centsToCsvDollars(-2500), // negative (refund)
    paymentMethod: "",
    receipt: "",
    reference: "",
    notes: "",
  },
];
const catCsv = buildCategorizedExpenseCsv(catRows);

assert(!catCsv.startsWith("﻿"), "no UTF-8 BOM");
assert(!/\r/.test(catCsv), "no CR characters");

const catParsed = parseCsvAll(catCsv);
const catHeader = catParsed[0];
const catData = catParsed.slice(1);
assert(
  catHeader.length === CATEGORIZED_EXPENSE_COLUMNS.length,
  `header has ${CATEGORIZED_EXPENSE_COLUMNS.length} columns (saw ${catHeader.length})`,
);
assert(
  CATEGORIZED_EXPENSE_COLUMNS.every((c, i) => catHeader[i] === c),
  "header column order matches CATEGORIZED_EXPENSE_COLUMNS",
);
assert(
  catData.length === catRows.length,
  `${catRows.length} data rows (saw ${catData.length})`,
);

section("[Categorized Expenses] date column ISO format");
const dateIdx = CATEGORIZED_EXPENSE_COLUMNS.indexOf("Date Paid");
for (let r = 0; r < catData.length; r++) {
  assert(
    /^\d{4}-\d{2}-\d{2}$/.test(catData[r][dateIdx]),
    `row ${r + 1} date ${JSON.stringify(catData[r][dateIdx])} is ISO YYYY-MM-DD`,
  );
}

section("[Categorized Expenses] amount column format");
const amtIdx = CATEGORIZED_EXPENSE_COLUMNS.indexOf("Amount");
const amtPattern = /^-?\d+\.\d{2}$/;
for (let r = 0; r < catData.length; r++) {
  const val = catData[r][amtIdx];
  assert(
    amtPattern.test(val),
    `row ${r + 1} amount ${JSON.stringify(val)} matches /^-?\\d+\\.\\d{2}$/`,
  );
  assert(!val.includes("$"), `row ${r + 1} amount has no $`);
  assert(!/,\d{3}/.test(val), `row ${r + 1} amount has no thousands separator`);
  assert(
    !/^\(.*\)$/.test(val),
    `row ${r + 1} amount uses leading "-" for negatives`,
  );
}

section("[Categorized Expenses] quoting + multi-row + round-trip");
assert(/"Acme, Inc\."/.test(catCsv), "comma-bearing vendor is quoted");
assert(
  /"Annual plan; ""renew Q1"""/.test(catCsv),
  "field with embedded quotes is wrapped + inner quotes doubled",
);
assert(
  /"Multi-line\nnote"/.test(catCsv),
  "multi-line note is wrapped in quotes",
);
const catRebuilt = catParsed.map(serializeCsvRow).join("\n");
assert(catRebuilt === catCsv, "build → parse → build round-trips byte-for-byte");

section("[Categorized Expenses] centsToCsvDollars edge cases");
assert(centsToCsvDollars(0) === "0.00", "0 cents → 0.00");
assert(centsToCsvDollars(99) === "0.99", "99 cents → 0.99");
assert(centsToCsvDollars(1_000_000_00) === "1000000.00", "$1M no separator");
assert(centsToCsvDollars(-2500) === "-25.00", "negative cents → -25.00");

section("Result");
if (failures > 0) {
  console.error(`\n✗ ${failures} assertion(s) failed.`);
  process.exit(1);
}
console.log("\n✓ all CSV contract assertions passed.");

// --------------------------------------------------------------------------
// Minimal RFC 4180 CSV parser. Inline to keep the test framework-free; we
// only need this for round-trip verification. Handles quoted newlines
// across rows (line-by-line splitting is unsafe).
// --------------------------------------------------------------------------
function parseCsvAll(text) {
  const rows = [];
  let cur = "";
  let row = [];
  let i = 0;
  let inQuotes = false;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        cur += ch;
        i++;
      }
    } else if (ch === '"' && cur === "") {
      inQuotes = true;
      i++;
    } else if (ch === ",") {
      row.push(cur);
      cur = "";
      i++;
    } else if (ch === "\n") {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
      i++;
    } else {
      cur += ch;
      i++;
    }
  }
  // Flush the final cell + row (file doesn't end with \n).
  row.push(cur);
  rows.push(row);
  return rows;
}

function serializeCsvRow(cells) {
  return cells
    .map((c) => {
      if (c === "") return "";
      if (/[",\n\r]/.test(c)) {
        return `"${c.replace(/"/g, '""')}"`;
      }
      return c;
    })
    .join(",");
}
