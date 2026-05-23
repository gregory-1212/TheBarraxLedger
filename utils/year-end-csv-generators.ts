// LED-49: data-fetching + CSV-building wrappers for the year-end CSV
// exports, factored out so both the standalone endpoints (/api/exports/...)
// and the Year-End Packet ZIP can reuse the same query logic. The "pure"
// CSV builders stay in utils/iris-1099-nec.ts and utils/categorized-expense-csv.ts —
// this module owns the database side.

import { type SupabaseClient } from "@supabase/supabase-js";
import {
  buildIris1099NecCsv,
  centsToIrisAmount,
  payerFromEnv,
  tinTypeForClassification,
  type IrisRecipient,
} from "./iris-1099-nec";
import {
  buildCategorizedExpenseCsv,
  centsToCsvDollars,
  type CategorizedExpenseRow,
} from "./categorized-expense-csv";

// 1099-NEC issuance threshold: $600.
const ISSUANCE_THRESHOLD_CENTS = 60000;
// 2026 backup-withholding threshold: $2,000.
const BACKUP_WITHHOLDING_THRESHOLD_CENTS = 200000;

export type IrisGenResult = { csv: string; recipientCount: number };
export type CategorizedExpenseGenResult = { csv: string; rowCount: number };

/**
 * Generate the IRIS 1099-NEC CSV for a given tax year. Fetches 1099-eligible
 * vendors + their YTD-paid totals (from public.vendor_ytd_paid view), filters
 * to ≥ $600, and builds the CSV via buildIris1099NecCsv.
 *
 * Caller is responsible for auth (this function trusts the supabase client
 * it was given).
 */
export async function generateIris1099NecCsv(
  supabase: SupabaseClient,
  year: number,
): Promise<IrisGenResult> {
  const { data: vendors, error: vendorsErr } = await supabase
    .from("vendors")
    .select(
      "id, name, dba, business_classification, billing_address, w9_status, tax_id_encrypted",
    )
    .eq("is_1099_eligible", true)
    .is("deleted_at", null);
  if (vendorsErr) throw new Error(vendorsErr.message);

  type VendorRow = {
    id: string;
    name: string;
    dba: string | null;
    business_classification: string | null;
    billing_address: string | null;
    w9_status: string;
    tax_id_encrypted: unknown;
  };
  const vendorRows = (vendors ?? []) as VendorRow[];
  if (vendorRows.length === 0) {
    const csv = buildIris1099NecCsv(year, payerFromEnv(), []);
    return { csv, recipientCount: 0 };
  }

  const { data: ytdRows, error: ytdErr } = await supabase
    .from("vendor_ytd_paid")
    .select("vendor_id, paid_total_cents")
    .eq("year", year)
    .in(
      "vendor_id",
      vendorRows.map((v) => v.id),
    );
  if (ytdErr) throw new Error(ytdErr.message);

  const ytdByVendor = new Map<string, number>();
  for (const r of (ytdRows ?? []) as Array<{
    vendor_id: string;
    paid_total_cents: number;
  }>) {
    ytdByVendor.set(r.vendor_id, r.paid_total_cents);
  }

  const recipients: IrisRecipient[] = vendorRows.flatMap((v) => {
    const ytdCents = ytdByVendor.get(v.id) ?? 0;
    if (ytdCents < ISSUANCE_THRESHOLD_CENTS) return [];
    void (!(v.w9_status === "received" || v.w9_status === "verified") &&
      ytdCents >= BACKUP_WITHHOLDING_THRESHOLD_CENTS);
    const recipient: IrisRecipient = {
      name: v.name,
      nameLine2: v.dba ?? "",
      tin: "", // LED-38 unblocks
      tinType: tinTypeForClassification(v.business_classification),
      addressLine1: v.billing_address ?? "",
      addressLine2: "",
      city: "",
      state: "",
      zip: "",
      countryCode: "US",
      accountNumber: v.id,
      nonemployeeCompensation: centsToIrisAmount(ytdCents),
      federalIncomeTaxWithheld: centsToIrisAmount(0),
      directSalesIndicator: false,
      secondTinNotice: false,
      fatcaFilingRequirement: false,
    };
    return [recipient];
  });

  const csv = buildIris1099NecCsv(year, payerFromEnv(), recipients);
  return { csv, recipientCount: recipients.length };
}

/**
 * Generate the categorized expense CSV for a given calendar year. Optional
 * category filter (UUID) narrows to a single expense_categories row.
 */
export async function generateCategorizedExpenseCsv(
  supabase: SupabaseClient,
  year: number,
  categoryId: string | null = null,
): Promise<CategorizedExpenseGenResult> {
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  let q = supabase
    .from("bills")
    .select(
      "paid_date, amount_paid_cents, payment_method, reference, notes, receipt_document_id, vendor:vendors(name), category:expense_categories(name, tax_treatment)",
    )
    .eq("status", "paid")
    .is("deleted_at", null)
    .not("paid_date", "is", null)
    .gte("paid_date", yearStart)
    .lte("paid_date", yearEnd)
    .order("paid_date", { ascending: true });
  if (categoryId) {
    q = q.eq("expense_category_id", categoryId);
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  type BillRow = {
    paid_date: string;
    amount_paid_cents: number | null;
    payment_method: string | null;
    reference: string | null;
    notes: string | null;
    receipt_document_id: string | null;
    vendor: { name: string } | { name: string }[] | null;
    category:
      | { name: string; tax_treatment: string }
      | { name: string; tax_treatment: string }[]
      | null;
  };
  const billRows = (data ?? []) as unknown as BillRow[];

  const rows: CategorizedExpenseRow[] = billRows.map((b) => {
    const v = Array.isArray(b.vendor) ? b.vendor[0] : b.vendor;
    const c = Array.isArray(b.category) ? b.category[0] : b.category;
    return {
      paidDate: b.paid_date,
      vendorName: v?.name ?? "(unknown vendor)",
      categoryName: c?.name ?? "Uncategorized",
      taxTreatment: c?.tax_treatment ?? "",
      amountDollars: centsToCsvDollars(b.amount_paid_cents ?? 0),
      paymentMethod: b.payment_method ?? "",
      receipt: b.receipt_document_id ? "in archive" : "",
      reference: b.reference ?? "",
      notes: b.notes ?? "",
    };
  });

  const csv = buildCategorizedExpenseCsv(rows);
  return { csv, rowCount: rows.length };
}
