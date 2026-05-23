import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { logAudit, AUDIT_ACTIONS } from "@/utils/audit-log";
import { generateCategorizedExpenseCsv } from "@/utils/year-end-csv-generators";

// LED-32: Year-end categorized expense CSV.
// GET /api/exports/categorized-expenses?year=YYYY&category=<uuid>
//
// Data fetching + CSV building live in utils/year-end-csv-generators.ts
// (so LED-49's Year-End Packet ZIP can reuse the same logic). This route
// is the auth + audit + download-headers shell.

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
  const categoryId = request.nextUrl.searchParams.get("category") ?? null;

  let result;
  try {
    result = await generateCategorizedExpenseCsv(supabase, year, categoryId);
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }

  await logAudit({
    action: AUDIT_ACTIONS.CSV_EXPORT,
    entityType: "categorized-expenses",
    metadata: {
      year,
      row_count: result.rowCount,
      format: "categorized-expenses",
      category_filter: categoryId,
    },
  });

  return new NextResponse(result.csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="categorized-expenses-${year}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
