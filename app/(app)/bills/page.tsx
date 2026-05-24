import Link from "next/link";
import { createClient } from "@/utils/supabase/server";

// LED-18: Bills index with status tabs (Due / Overdue / Paid).
// Per research/bills.md: status TABS, not filter dropdowns. Best-in-class
// pattern from Xero/QBO. Default to "Due" (unpaid + non-overdue).

type Bill = {
  id: string;
  amount_cents: number;
  due_date: string;
  paid_date: string | null;
  status: string;
  reference: string | null;
  vendor: { id: string; name: string } | null;
  expense_category: { name: string } | null;
};

const TABS = [
  { id: "due", label: "Due Soon" },
  { id: "overdue", label: "Overdue" },
  { id: "paid", label: "Paid" },
  { id: "all", label: "All" },
] as const;

type TabId = (typeof TABS)[number]["id"];

// LED-15: ?vendor=<uuid> filter, used by vendor detail's "View all bills →"
// link. Doesn't change the existing tab semantics — just narrows every query
// to a single vendor.
type Search = { tab?: TabId; vendor?: string };

function isUuid(s: string | undefined): s is string {
  return !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDollars(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}$${(abs / 100).toFixed(2)}`;
}

function daysUntil(iso: string): number {
  const due = new Date(iso + "T00:00:00").getTime();
  const today = new Date(new Date().toDateString()).getTime();
  return Math.round((due - today) / 86_400_000);
}

function dueClasses(daysAway: number, paid: boolean): string {
  if (paid) return "text-zinc-500";
  if (daysAway < 0) return "text-red-300 font-medium";
  if (daysAway <= 7) return "text-orange-300";
  if (daysAway <= 14) return "text-amber-300";
  return "text-zinc-400";
}

function rowClasses(daysAway: number, paid: boolean): string {
  if (paid) return "hover:bg-zinc-900";
  if (daysAway < 0) return "bg-red-950/30 hover:bg-red-950/40";
  if (daysAway <= 14) return "bg-amber-950/20 hover:bg-amber-950/30";
  return "hover:bg-zinc-900";
}

export default async function BillsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const params = await searchParams;
  const tab: TabId =
    params.tab && TABS.some((t) => t.id === params.tab) ? params.tab : "due";
  const vendorFilter = isUuid(params.vendor) ? params.vendor : null;

  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  // If a vendor filter is active, fetch the vendor name for the banner.
  // One small query; cheaper than nag-joining it to every bill row.
  let filteredVendor: { id: string; name: string } | null = null;
  if (vendorFilter) {
    const { data: v } = await supabase
      .from("vendors")
      .select("id, name")
      .eq("id", vendorFilter)
      .is("deleted_at", null)
      .maybeSingle();
    filteredVendor = (v as { id: string; name: string } | null) ?? null;
  }

  let query = supabase
    .from("bills")
    .select(
      "id, amount_cents, due_date, paid_date, status, reference, vendor:vendors(id, name), expense_category:expense_categories(name)",
    )
    .is("deleted_at", null);
  if (vendorFilter) query = query.eq("vendor_id", vendorFilter);

  if (tab === "due") {
    query = query
      .is("paid_date", null)
      .gte("due_date", today)
      .order("due_date", { ascending: true });
  } else if (tab === "overdue") {
    query = query
      .is("paid_date", null)
      .lt("due_date", today)
      .order("due_date", { ascending: true });
  } else if (tab === "paid") {
    query = query
      .not("paid_date", "is", null)
      .order("paid_date", { ascending: false });
  } else {
    query = query.order("due_date", { ascending: true });
  }

  const { data, error } = await query;
  const bills = (data as unknown as Bill[] | null) ?? [];

  const unpaidTotal = bills
    .filter((b) => !b.paid_date)
    .reduce((acc, b) => acc + b.amount_cents, 0);
  const paidTotal = bills
    .filter((b) => b.paid_date)
    .reduce((acc, b) => acc + b.amount_cents, 0);

  // Tab counts respect the vendor filter so the badges match the visible list.
  const countBuilder = () => {
    let q = supabase
      .from("bills")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null);
    if (vendorFilter) q = q.eq("vendor_id", vendorFilter);
    return q;
  };
  const counts = await Promise.all([
    countBuilder().is("paid_date", null).gte("due_date", today),
    countBuilder().is("paid_date", null).lt("due_date", today),
    countBuilder().not("paid_date", "is", null),
  ]);
  const tabCounts: Record<TabId, number | null> = {
    due: counts[0].count ?? 0,
    overdue: counts[1].count ?? 0,
    paid: counts[2].count ?? 0,
    all: null,
  };

  // Helper for tab links: preserve vendor filter, swap tab.
  const tabHref = (id: TabId): string => {
    const parts: string[] = [];
    if (id !== "due") parts.push(`tab=${id}`);
    if (vendorFilter) parts.push(`vendor=${vendorFilter}`);
    return parts.length === 0 ? "/bills" : `/bills?${parts.join("&")}`;
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bills</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Recurring + one-off expenses. Categorized for year-end CSV.
          </p>
        </div>
        <Link
          href="/bills/new"
          className="print:hidden rounded-md bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-white transition-colors"
        >
          Add Bill
        </Link>
      </header>

      {/* Status tabs */}
      <div className="print:hidden flex items-center gap-1 mb-4 border-b border-zinc-800">
        {TABS.map((t) => {
          const active = t.id === tab;
          const count = tabCounts[t.id];
          return (
            <Link
              key={t.id}
              href={tabHref(t.id)}
              className={
                "px-3 py-2 text-sm border-b-2 transition-colors -mb-px " +
                (active
                  ? "border-zinc-100 text-zinc-100"
                  : "border-transparent text-zinc-400 hover:text-zinc-200")
              }
            >
              {t.label}
              {count !== null && (
                <span className="ml-1.5 text-xs text-zinc-500">{count}</span>
              )}
            </Link>
          );
        })}
      </div>

      {filteredVendor && (
        <div className="print:hidden mb-4 flex items-center justify-between gap-3 rounded-md border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-sm">
          <span className="text-zinc-400">
            Filtered to vendor{" "}
            <Link
              href={`/vendors/${filteredVendor.id}`}
              className="text-zinc-100 hover:underline"
            >
              {filteredVendor.name}
            </Link>
          </span>
          <Link
            href={tab === "due" ? "/bills" : `/bills?tab=${tab}`}
            className="text-xs text-zinc-500 hover:text-zinc-200"
          >
            × clear
          </Link>
        </div>
      )}

      {error ? (
        <div className="rounded-md border border-red-900/50 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          Couldn&apos;t load bills: {error.message}
        </div>
      ) : bills.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-800 bg-zinc-950 px-6 py-12 text-center">
          <p className="text-sm text-zinc-400">
            {tab === "due"
              ? "No bills due."
              : tab === "overdue"
                ? "No overdue bills."
                : tab === "paid"
                  ? "No paid bills yet."
                  : "No bills yet."}
          </p>
          {(tab === "all" || (tab === "due" && tabCounts.due === 0)) && (
            <Link
              href="/bills/new"
              className="inline-block mt-3 text-sm text-zinc-200 hover:text-white underline"
            >
              Add the first one
            </Link>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-zinc-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/50 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Vendor</th>
                <th className="text-left px-4 py-2 font-medium">Category</th>
                <th className="text-left px-4 py-2 font-medium">Reference</th>
                <th className="text-right px-4 py-2 font-medium">Amount</th>
                <th className="text-right px-4 py-2 font-medium">
                  {tab === "paid" ? "Paid" : "Due"}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {bills.map((b) => {
                const days = daysUntil(b.due_date);
                const paid = !!b.paid_date;
                return (
                  <tr
                    key={b.id}
                    className={`${rowClasses(days, paid)} transition-colors`}
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/bills/${b.id}`}
                        className="text-zinc-100 hover:underline"
                      >
                        {b.vendor?.name ?? "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-zinc-400">
                      <Link
                        href={`/bills/${b.id}`}
                        className="hover:underline"
                      >
                        {b.expense_category?.name ?? "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-zinc-500 text-xs">
                      <Link
                        href={`/bills/${b.id}`}
                        className="hover:underline"
                      >
                        {b.reference ?? ""}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-100 tabular-nums">
                      <Link
                        href={`/bills/${b.id}`}
                        className="hover:underline"
                      >
                        {formatDollars(b.amount_cents)}
                      </Link>
                    </td>
                    <td
                      className={`px-4 py-3 text-right tabular-nums ${dueClasses(days, paid)}`}
                    >
                      <Link href={`/bills/${b.id}`} className="hover:underline">
                        {paid && b.paid_date
                          ? formatDate(b.paid_date)
                          : formatDate(b.due_date)}
                        {!paid && (
                          <span className="block text-xs text-zinc-500">
                            {days < 0
                              ? `${Math.abs(days)}d overdue`
                              : days === 0
                                ? "today"
                                : `in ${days}d`}
                          </span>
                        )}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-zinc-900/30 text-xs">
              <tr>
                <td colSpan={3} className="px-4 py-2 text-zinc-500">
                  {bills.length} bill{bills.length === 1 ? "" : "s"}
                </td>
                <td className="px-4 py-2 text-right text-zinc-400 tabular-nums">
                  {tab === "paid"
                    ? `${formatDollars(paidTotal)} paid`
                    : `${formatDollars(unpaidTotal)} unpaid`}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
