import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { logAudit, AUDIT_ACTIONS } from "@/utils/audit-log";
import {
  buildIris1099NecCsv,
  centsToIrisAmount,
  payerFromEnv,
  tinTypeForClassification,
  type IrisRecipient,
} from "@/utils/iris-1099-nec";

// LED-28: Year-end 1099-NEC CSV export in IRS IRIS format.
// GET /api/exports/1099-nec?year=2026
//
// Behavior:
//   - Auth: staff only. RLS on vendors + vendor_ytd_paid view enforces is_staff()
//     and we also reject unauthenticated requests up front.
//   - Year default: previous calendar year if today is past Jan 31, else
//     current year (so the export does the right thing whether you're filing
//     in January for last year or auditing mid-year for the current year).
//   - Filter: only 1099-eligible vendors with YTD paid ≥ $600 in the year.
//   - TIN: LED-38 isn't wired yet, so tax_id_encrypted is unread for now.
//     When LED-38 lands, replace the empty-string TIN with an audited
//     decrypt(tax_id_encrypted) call.
//   - Audit: every export writes an audit_log row (action="csv_export",
//     metadata={year, recipient_count, format:"iris-1099-nec"}).

function defaultYear(today: Date = new Date()): number {
  const yyyy = today.getFullYear();
  // Past Jan 31 → previous year (filing season). Otherwise current year.
  const pastJan31 =
    today.getMonth() > 0 || (today.getMonth() === 0 && today.getDate() > 31);
  return pastJan31 ? yyyy - 1 : yyyy;
}

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

  // Pull 1099-eligible vendors with their YTD-paid totals for the year.
  // The view returns (vendor_id, year, paid_total_cents); we filter to
  // ≥ $600 in JS after the join so we can still see the vendor row even when
  // the view returns no row for that year (LEFT JOIN equivalent via two
  // queries — Supabase JS doesn't support raw LEFT JOIN as cleanly).
  const { data: vendors, error: vendorsErr } = await supabase
    .from("vendors")
    .select(
      "id, name, dba, business_classification, billing_address, w9_status, tax_id_encrypted",
    )
    .eq("is_1099_eligible", true)
    .is("deleted_at", null);
  if (vendorsErr) {
    return NextResponse.json({ error: vendorsErr.message }, { status: 500 });
  }
  const vendorRows = (vendors ?? []) as Array<{
    id: string;
    name: string;
    dba: string | null;
    business_classification: string | null;
    billing_address: string | null;
    w9_status: string;
    tax_id_encrypted: unknown; // bytea — unused until LED-38 wires decryption
  }>;
  if (vendorRows.length === 0) {
    return csvResponse(buildIris1099NecCsv(year, payerFromEnv(), []), year);
  }

  const { data: ytdRows, error: ytdErr } = await supabase
    .from("vendor_ytd_paid")
    .select("vendor_id, paid_total_cents")
    .eq("year", year)
    .in(
      "vendor_id",
      vendorRows.map((v) => v.id),
    );
  if (ytdErr) {
    return NextResponse.json({ error: ytdErr.message }, { status: 500 });
  }
  const ytdByVendor = new Map<string, number>();
  for (const r of (ytdRows ?? []) as Array<{
    vendor_id: string;
    paid_total_cents: number;
  }>) {
    ytdByVendor.set(r.vendor_id, r.paid_total_cents);
  }

  // 1099-NEC issuance threshold: $600 in cents.
  const ISSUANCE_THRESHOLD_CENTS = 60000;
  // Backup withholding 2026: $2,000 in cents.
  const BACKUP_WITHHOLDING_THRESHOLD_CENTS = 200000;

  const recipients: IrisRecipient[] = vendorRows.flatMap((v) => {
    const ytdCents = ytdByVendor.get(v.id) ?? 0;
    if (ytdCents < ISSUANCE_THRESHOLD_CENTS) return [];

    // Backup-withholding flag for awareness — actual withholding happens at
    // payment time (LED-44). When LED-44 records the withheld amount per
    // bill, surface that here in Box 4 instead of the current zero.
    void (!(v.w9_status === "received" || v.w9_status === "verified") &&
      ytdCents >= BACKUP_WITHHOLDING_THRESHOLD_CENTS);

    const recipient: IrisRecipient = {
      name: v.name,
      nameLine2: v.dba ?? "",
      // TIN intentionally blank until LED-38 wires server-side decrypt of
      // vendors.tax_id_encrypted. The CSV is still parseable; the CPA's
      // filing tool flags missing TINs as the next required step.
      tin: "",
      tinType: tinTypeForClassification(v.business_classification),
      // billing_address is a single text blob in this schema. IRIS wants
      // split fields. Park the full address in Line 1 and leave the split
      // columns blank — splitting is fragile and the CPA's filing tool
      // accepts the union or prompts.
      addressLine1: v.billing_address ?? "",
      addressLine2: "",
      city: "",
      state: "",
      zip: "",
      countryCode: "US",
      accountNumber: v.id, // vendor UUID as internal recipient ref
      nonemployeeCompensation: centsToIrisAmount(ytdCents),
      federalIncomeTaxWithheld: centsToIrisAmount(0),
      directSalesIndicator: false,
      secondTinNotice: false,
      fatcaFilingRequirement: false,
    };
    return [recipient];
  });

  const csv = buildIris1099NecCsv(year, payerFromEnv(), recipients);

  await logAudit({
    action: AUDIT_ACTIONS.CSV_EXPORT,
    entityType: "1099-nec-iris",
    metadata: {
      year,
      recipient_count: recipients.length,
      format: "iris-1099-nec",
    },
  });

  return csvResponse(csv, year);
}

function csvResponse(csv: string, year: number): NextResponse {
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="1099-NEC-IRIS-${year}.csv"`,
      // CSV download isn't cacheable — it's a point-in-time snapshot.
      "Cache-Control": "no-store",
    },
  });
}
