import Link from "next/link";
import { createClient } from "@/utils/supabase/server";

// LED-31: Reports page shell with tabbed layout.
// LED-32: First live tab is "Year-end expenses" — categorized CSV export.
// The other tabs are scaffolded as Coming Soon pending their own issues:
//   - 1099 contractors (lives at /vendors?tab=1099 today — link out)
//   - Receipts (LED-22 Storage bucket)
//   - P&L summary (LED-33)

const TABS = [
  { id: "expenses", label: "Year-end expenses" },
  { id: "1099", label: "1099 contractors" },
  { id: "receipts", label: "Receipts" },
  { id: "pnl", label: "P&L summary" },
] as const;
type TabId = (typeof TABS)[number]["id"];

function defaultYear(today: Date = new Date()): number {
  const yyyy = today.getFullYear();
  const pastJan31 =
    today.getMonth() > 0 || (today.getMonth() === 0 && today.getDate() > 31);
  return pastJan31 ? yyyy - 1 : yyyy;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; year?: string; category?: string }>;
}) {
  const params = await searchParams;
  const tab: TabId = (TABS.find((t) => t.id === params.tab)?.id ?? "expenses");
  const yearParam = params.year ? parseInt(params.year, 10) : NaN;
  const year =
    Number.isInteger(yearParam) && yearParam >= 2000 && yearParam <= 2100
      ? yearParam
      : defaultYear();
  const categoryFilter = params.category ?? null;

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Year-end CSV exports for the CPA. Pick a tab, or grab the whole
            packet.
          </p>
        </div>
        {/* LED-49: Year-End Packet ZIP — bundles every CSV the CPA needs */}
        <a
          href={`/api/exports/year-end-packet?year=${year}`}
          className="print:hidden rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-white transition-colors whitespace-nowrap"
          download
        >
          Year-End Packet ({year})
        </a>
      </header>

      <div className="print:hidden flex items-center gap-1 mb-6 border-b border-zinc-800">
        {TABS.map((t) => {
          const active = t.id === tab;
          const href =
            t.id === "expenses" && year !== defaultYear()
              ? `/reports?tab=${t.id}&year=${year}`
              : `/reports?tab=${t.id}`;
          return (
            <Link
              key={t.id}
              href={href}
              className={
                "px-3 py-2 text-sm border-b-2 transition-colors -mb-px " +
                (active
                  ? "border-zinc-100 text-zinc-100"
                  : "border-transparent text-zinc-400 hover:text-zinc-200")
              }
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {tab === "expenses" && (
        <ExpensesTab year={year} categoryFilter={categoryFilter} />
      )}
      {tab === "1099" && <Tab1099Pointer />}
      {tab === "receipts" && <ComingSoon issue="LED-22" />}
      {tab === "pnl" && <ComingSoon issue="LED-33" />}
    </div>
  );
}

async function ExpensesTab({
  year,
  categoryFilter,
}: {
  year: number;
  categoryFilter: string | null;
}) {
  const supabase = await createClient();

  // Year picker neighbors. Cap upper bound at "current year + 1" so we don't
  // offer future-year exports that have no data.
  const today = new Date();
  const currentYear = today.getFullYear();
  const yearOptions = [
    currentYear - 2,
    currentYear - 1,
    currentYear,
  ].filter((y) => y >= 2024); // Ledger launched 2026; nothing before 2024 worth showing

  // Category dropdown options.
  const { data: catData } = await supabase
    .from("expense_categories")
    .select("id, name")
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });
  const categories = (catData ?? []) as Array<{ id: string; name: string }>;

  // Preview: paid bill count + total for the selected year/category.
  let billsQuery = supabase
    .from("bills")
    .select("amount_paid_cents", { count: "exact" })
    .eq("status", "paid")
    .is("deleted_at", null)
    .not("paid_date", "is", null)
    .gte("paid_date", `${year}-01-01`)
    .lte("paid_date", `${year}-12-31`);
  if (categoryFilter) {
    billsQuery = billsQuery.eq("expense_category_id", categoryFilter);
  }
  const { data: billsData, count } = await billsQuery;
  const totalCents = (
    (billsData ?? []) as Array<{ amount_paid_cents: number | null }>
  ).reduce((acc, r) => acc + (r.amount_paid_cents ?? 0), 0);

  const exportHref = `/api/exports/categorized-expenses?year=${year}${
    categoryFilter ? `&category=${categoryFilter}` : ""
  }`;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs uppercase tracking-wide text-zinc-500 mb-1">
              Year
            </label>
            <div className="flex items-center gap-1">
              {yearOptions.map((y) => {
                const active = y === year;
                const href = `/reports?tab=expenses&year=${y}${
                  categoryFilter ? `&category=${categoryFilter}` : ""
                }`;
                return (
                  <Link
                    key={y}
                    href={href}
                    className={
                      "rounded-md px-3 py-1.5 text-sm transition-colors " +
                      (active
                        ? "bg-zinc-100 text-zinc-900 font-medium"
                        : "border border-zinc-800 text-zinc-300 hover:border-zinc-700")
                    }
                  >
                    {y}
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs uppercase tracking-wide text-zinc-500 mb-1">
              Category
            </label>
            {/* No client form — categories swap via plain URLs to keep the
                page a server component. */}
            <div className="flex flex-wrap gap-1">
              <Link
                href={`/reports?tab=expenses&year=${year}`}
                className={
                  "rounded-md px-2 py-1 text-xs transition-colors " +
                  (!categoryFilter
                    ? "bg-zinc-100 text-zinc-900 font-medium"
                    : "border border-zinc-800 text-zinc-300 hover:border-zinc-700")
                }
              >
                All
              </Link>
              {categories.map((c) => {
                const active = categoryFilter === c.id;
                return (
                  <Link
                    key={c.id}
                    href={`/reports?tab=expenses&year=${year}&category=${c.id}`}
                    className={
                      "rounded-md px-2 py-1 text-xs transition-colors " +
                      (active
                        ? "bg-zinc-100 text-zinc-900 font-medium"
                        : "border border-zinc-800 text-zinc-300 hover:border-zinc-700")
                    }
                  >
                    {c.name}
                  </Link>
                );
              })}
            </div>
          </div>

          <a
            href={exportHref}
            className="rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-white transition-colors print:hidden"
            download
          >
            Export CSV
          </a>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-6">
        <p className="text-sm text-zinc-400">
          {count ?? 0} paid bill{count === 1 ? "" : "s"} in {year}
          {categoryFilter ? " (filtered)" : ""}, totaling{" "}
          <span className="text-zinc-100 tabular-nums">
            ${(totalCents / 100).toFixed(2)}
          </span>
        </p>
        <p className="text-xs text-zinc-500 mt-2">
          Export downloads a CSV with one row per paid bill: date, vendor,
          category, amount, payment method, receipt pointer, reference, notes.
        </p>
      </div>
    </div>
  );
}

function Tab1099Pointer() {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-6">
      <h2 className="text-sm font-medium text-zinc-100 mb-2">
        1099-NEC export lives on the Vendors page
      </h2>
      <p className="text-sm text-zinc-400 mb-4">
        The 1099 Readiness tab on Vendors shows all 1099-eligible contractors,
        their W-9 status, and YTD spend, plus the IRIS-format CSV download.
      </p>
      <Link
        href="/vendors?tab=1099"
        className="inline-block rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-white transition-colors"
      >
        Go to 1099 Readiness →
      </Link>
    </div>
  );
}

function ComingSoon({ issue }: { issue: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-12 text-center">
      <div className="text-zinc-600 text-xs uppercase tracking-wide mb-2">
        Coming Soon
      </div>
      <p className="text-sm text-zinc-500">
        Tracked in {issue}. Not built yet.
      </p>
    </div>
  );
}
