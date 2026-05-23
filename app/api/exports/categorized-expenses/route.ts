import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { logAudit, AUDIT_ACTIONS } from "@/utils/audit-log";
import {
  buildCategorizedExpenseCsv,
  centsToCsvDollars,
  type CategorizedExpenseRow,
} from "@/utils/categorized-expense-csv";

// LED-32: Year-end categorized expense CSV.
// GET /api/exports/categorized-expenses?year=YYYY&category=<uuid>
//
// Returns every paid bill (status=paid, paid_date NOT NULL) inside the
// calendar year. Optional category filter (UUID of expense_categories row)
// narrows to a single category.
//
// Auth: staff only (RLS on bills + vendors + expense_categories enforces
// is_staff(); we also 401 unauthenticated requests up front).
//
// Receipts URL column: returns "in archive" for bills with a receipt
// document attached, empty otherwise. Signed URLs for the CPA are the
// LED-22 (Storage bucket) follow-up — once that lands, swap the placeholder
// for a real signed URL with long expiry.

function defaultYear(today: Date = new Date()): number {
  const yyyy = today.getFullYear();
  // Past Jan 31 → previous year (we're filing for last year).
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
  const categoryId = request.nextUrl.searchParams.get("category") ?? null;

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
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Supabase typing on the nested select returns vendor/category as either
  // an object or null. Normalize to strings (with sensible fallbacks) here
  // so the helper doesn't need to know about row shape.
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
      // LED-22 (Storage bucket) will replace this with a signed URL.
      receipt: b.receipt_document_id ? "in archive" : "",
      reference: b.reference ?? "",
      notes: b.notes ?? "",
    };
  });

  const csv = buildCategorizedExpenseCsv(rows);

  await logAudit({
    action: AUDIT_ACTIONS.CSV_EXPORT,
    entityType: "categorized-expenses",
    metadata: {
      year,
      row_count: rows.length,
      format: "categorized-expenses",
      category_filter: categoryId,
    },
  });

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="categorized-expenses-${year}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
