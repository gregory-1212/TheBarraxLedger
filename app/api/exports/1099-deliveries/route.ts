import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { logAudit, AUDIT_ACTIONS } from "@/utils/audit-log";

// LED-45: CSV export of the 1099-NEC delivery log for a given tax year.
// One row per (year, vendor) delivery — provides IRS proof if audited.
//
// GET /api/exports/1099-deliveries?year=YYYY

const COLUMNS = [
  "Tax Year",
  "Vendor",
  "Method",
  "Delivered At",
  "Delivered By",
  "Notes",
] as const;

function csvField(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s === "") return "";
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function defaultYear(today: Date = new Date()): number {
  const yyyy = today.getFullYear();
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

  const { data, error } = await supabase
    .from("form_1099_deliveries")
    .select(
      "tax_year, method, delivered_at, notes, vendor:vendors(name), delivered_by_user:auth_users_view(email)",
    )
    .eq("tax_year", year)
    .order("delivered_at", { ascending: true });

  // The auth_users_view join can fail silently in some setups; the email
  // column falls back to "(staff)" if missing. Don't 500 the export on this.
  type Row = {
    tax_year: number;
    method: string;
    delivered_at: string;
    notes: string | null;
    vendor: { name: string } | { name: string }[] | null;
    delivered_by_user?: { email: string } | { email: string }[] | null;
  };
  const rows = (
    error
      ? // Retry without the user join if the view isn't present.
        (
          await supabase
            .from("form_1099_deliveries")
            .select(
              "tax_year, method, delivered_at, notes, vendor:vendors(name)",
            )
            .eq("tax_year", year)
            .order("delivered_at", { ascending: true })
        ).data
      : data
  ) as unknown as Row[] | null;

  const lines: string[] = [];
  lines.push(COLUMNS.map(csvField).join(","));
  for (const r of rows ?? []) {
    const vendor = Array.isArray(r.vendor) ? r.vendor[0] : r.vendor;
    const user = Array.isArray(r.delivered_by_user)
      ? r.delivered_by_user[0]
      : r.delivered_by_user;
    const cells = [
      String(r.tax_year),
      vendor?.name ?? "(unknown vendor)",
      r.method.replace("_", " "),
      // ISO date only (no time) for spreadsheet friendliness.
      r.delivered_at.slice(0, 10),
      user?.email ?? "(staff)",
      r.notes ?? "",
    ];
    lines.push(cells.map(csvField).join(","));
  }
  const csv = lines.join("\n");

  await logAudit({
    action: AUDIT_ACTIONS.CSV_EXPORT,
    entityType: "form_1099_deliveries",
    metadata: {
      year,
      row_count: (rows ?? []).length,
      format: "1099-deliveries",
    },
  });

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="1099-NEC-deliveries-${year}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
