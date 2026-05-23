import { type NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { createClient } from "@/utils/supabase/server";
import { logAudit, AUDIT_ACTIONS } from "@/utils/audit-log";
import {
  generateIris1099NecCsv,
  generateCategorizedExpenseCsv,
} from "@/utils/year-end-csv-generators";

// LED-49: Year-End Packet ZIP exporter (Bench-style CPA bundle).
// GET /api/exports/year-end-packet?year=YYYY
//
// Bundles every artifact the CPA needs into a single ZIP. As each
// underlying export issue ships, this packet gains that file:
//
//   contractors_1099_nec_{year}.csv      ← LED-28 (LIVE)
//   expenses_by_category_{year}.csv      ← LED-32 (LIVE)
//   pnl_{year}.csv                        ← LED-33 (pending)
//   receipts_index_{year}.csv             ← LED-22 + LED-24 (pending)
//   receipts/{year}-...                   ← LED-22 (pending)
//   compliance_filings_{year}/...         ← LED-5 docs archive (pending)
//   README.txt                            ← describes what's in/not in
//
// The packet ships partial today (1099 + categorized expenses + README).
// Adding new artifacts is a contained edit: import a new generator, push
// another zip.file() call. README enumeration updates in lock-step.

function defaultYear(today: Date = new Date()): number {
  const yyyy = today.getFullYear();
  const pastJan31 =
    today.getMonth() > 0 || (today.getMonth() === 0 && today.getDate() > 31);
  return pastJan31 ? yyyy - 1 : yyyy;
}

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const yearParam = request.nextUrl.searchParams.get("year");
  const year = yearParam ? parseInt(yearParam, 10) : defaultYear();
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: "invalid year" }, { status: 400 });
  }

  let irisResult, expensesResult;
  try {
    [irisResult, expensesResult] = await Promise.all([
      generateIris1099NecCsv(supabase, year),
      generateCategorizedExpenseCsv(supabase, year, null),
    ]);
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }

  const zip = new JSZip();
  zip.file(`contractors_1099_nec_${year}.csv`, irisResult.csv);
  zip.file(`expenses_by_category_${year}.csv`, expensesResult.csv);
  zip.file(
    "README.txt",
    buildReadme(year, {
      irisRows: irisResult.recipientCount,
      expensesRows: expensesResult.rowCount,
    }),
  );

  // JSZip's nodebuffer generation is in-memory. For The Barrax's scale a
  // year of CSVs is tens of KB so this is fine; if the packet grows past a
  // few MB (when receipts + compliance docs start riding along) swap to
  // generateNodeStream() + Web ReadableStream piping.
  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  await logAudit({
    action: AUDIT_ACTIONS.YEAR_END_PACKET_EXPORT,
    entityType: "year-end-packet",
    metadata: {
      year,
      iris_recipient_count: irisResult.recipientCount,
      expenses_row_count: expensesResult.rowCount,
      includes: [
        `contractors_1099_nec_${year}.csv`,
        `expenses_by_category_${year}.csv`,
        "README.txt",
      ],
    },
  });

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="barrax-year-end-${year}.zip"`,
      "Content-Length": String(buffer.length),
      "Cache-Control": "no-store",
    },
  });
}

function buildReadme(
  year: number,
  counts: { irisRows: number; expensesRows: number },
): string {
  const generatedAt = new Date().toISOString();
  return `The Barrax — Year-End Packet ${year}
Generated: ${generatedAt}

INCLUDED IN THIS PACKET
-----------------------

contractors_1099_nec_${year}.csv  (${counts.irisRows} row${counts.irisRows === 1 ? "" : "s"})
    IRS IRIS-format 1099-NEC CSV. Every 1099-eligible vendor paid ≥ $600 in
    ${year} with a row per contractor. Columns match the IRS IRIS template
    (verify against the current year's template at
    https://www.irs.gov/filing/e-file-information-returns-with-iris).
    Note: payee TINs are blank pending LED-38 (server-side decryption of
    tax_id_encrypted). The CPA's filing tool will prompt for them.

expenses_by_category_${year}.csv  (${counts.expensesRows} row${counts.expensesRows === 1 ? "" : "s"})
    All paid bills in ${year}, one row per bill. Columns: Date Paid, Vendor,
    Category, Tax Treatment, Amount (dollars), Payment Method, Receipt
    (pointer), Reference, Notes.


NOT YET INCLUDED
----------------

pnl_${year}.csv
    P&L summary (CRM income + Ledger expenses). Tracked in LED-33; requires
    a cross-app internal API.

receipts_index_${year}.csv  +  receipts/ folder
    Receipt archive index + the actual receipt files. Tracked in LED-22
    (Supabase Storage bucket) + LED-24 (receipts page). Receipts are
    surfaced today as an "in archive" pointer in expenses_by_category;
    once LED-22 ships, signed URLs land in the index and the originals
    ride along in this packet.

compliance_filings_${year}/ folder
    Annual report PDFs and other compliance filings. Tracked in LED-34
    universal documents archive (the compliance attachments exist; bundling
    them into the packet is the remaining wire-up).


FORMAT INVARIANTS (every CSV in this packet)
--------------------------------------------

* ISO dates: YYYY-MM-DD
* Amounts: bare decimals like 1247.50 (no $, no thousands separator, no
  parentheses for negatives)
* UTF-8 encoded, LF line endings, no BOM
* Header row present
* RFC 4180 quoting

These invariants are pinned by an automated contract test
(__tests__/csv-exports.test.mjs in the Ledger repo). Format drift fails the
test before reaching the CPA.
`;
}
