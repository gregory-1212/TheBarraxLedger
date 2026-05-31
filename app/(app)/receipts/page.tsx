import Link from "next/link";
import { createClient } from "@/utils/supabase/server";

// LED-24: Receipts index — status tabs (Needs Review / Confirmed / All).
// Mirrors the bills index pattern. A receipt is "pending" until staff review +
// confirm the OCR extraction.

type Receipt = {
  id: string;
  status: string;
  ocr_status: string;
  receipt_date: string | null;
  total_cents: number | null;
  payment_method: string | null;
  created_at: string;
  vendor: { name: string } | null;
  expense_category: { name: string } | null;
};

const TABS = [
  { id: "pending", label: "Needs Review" },
  { id: "confirmed", label: "Confirmed" },
  { id: "all", label: "All" },
] as const;

type TabId = (typeof TABS)[number]["id"];
type Search = { tab?: TabId };

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function formatDollars(cents: number | null): string {
  if (cents == null) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

export default async function ReceiptsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const tab: TabId = params.tab && TABS.some((t) => t.id === params.tab) ? params.tab : "pending";

  const supabase = await createClient();

  let query = supabase
    .from("receipts")
    .select("id, status, ocr_status, receipt_date, total_cents, payment_method, created_at, vendor:vendors(name), expense_category:expense_categories(name)")
    .is("deleted_at", null);
  if (tab === "pending") query = query.eq("status", "pending");
  else if (tab === "confirmed") query = query.eq("status", "confirmed");
  query = query.order("created_at", { ascending: false });

  const { data, error } = await query;
  const receipts = (data as unknown as Receipt[] | null) ?? [];

  const countBuilder = () => supabase.from("receipts").select("id", { count: "exact", head: true }).is("deleted_at", null);
  const counts = await Promise.all([
    countBuilder().eq("status", "pending"),
    countBuilder().eq("status", "confirmed"),
  ]);
  const tabCounts: Record<TabId, number | null> = { pending: counts[0].count ?? 0, confirmed: counts[1].count ?? 0, all: null };

  const tabHref = (id: TabId): string => (id === "pending" ? "/receipts" : `/receipts?tab=${id}`);

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Receipts</h1>
          <p className="text-sm text-zinc-400 mt-1">Snap a photo — OCR pulls the vendor, date, and total for you to confirm.</p>
        </div>
        <Link href="/receipts/capture" className="rounded-md bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-white transition-colors">
          Add Receipt
        </Link>
      </header>

      <div className="flex items-center gap-1 mb-4 border-b border-zinc-800">
        {TABS.map((t) => {
          const active = t.id === tab;
          const count = tabCounts[t.id];
          return (
            <Link
              key={t.id}
              href={tabHref(t.id)}
              className={"px-3 py-2 text-sm border-b-2 transition-colors -mb-px " + (active ? "border-zinc-100 text-zinc-100" : "border-transparent text-zinc-400 hover:text-zinc-200")}
            >
              {t.label}
              {count !== null && <span className="ml-1.5 text-xs text-zinc-500">{count}</span>}
            </Link>
          );
        })}
      </div>

      {error ? (
        <div className="rounded-md border border-red-900/50 bg-red-950/40 px-4 py-3 text-sm text-red-200">Couldn&apos;t load receipts: {error.message}</div>
      ) : receipts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-800 bg-zinc-950 px-6 py-12 text-center">
          <p className="text-sm text-zinc-400">{tab === "confirmed" ? "No confirmed receipts yet." : "No receipts yet."}</p>
          <Link href="/receipts/capture" className="inline-block mt-3 text-sm text-zinc-200 hover:text-white underline">Add the first one</Link>
        </div>
      ) : (
        <div className="rounded-lg border border-zinc-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/50 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Vendor</th>
                <th className="text-left px-4 py-2 font-medium">Category</th>
                <th className="text-left px-4 py-2 font-medium">Date</th>
                <th className="text-right px-4 py-2 font-medium">Total</th>
                <th className="text-right px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {receipts.map((r) => {
                const ocrFailed = r.ocr_status === "failed" || r.ocr_status === "skipped";
                return (
                  <tr key={r.id} className="hover:bg-zinc-900 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/receipts/${r.id}`} className="text-zinc-100 hover:underline">{r.vendor?.name ?? <span className="text-zinc-500">Unassigned</span>}</Link>
                    </td>
                    <td className="px-4 py-3 text-zinc-400"><Link href={`/receipts/${r.id}`} className="hover:underline">{r.expense_category?.name ?? "—"}</Link></td>
                    <td className="px-4 py-3 text-zinc-400"><Link href={`/receipts/${r.id}`} className="hover:underline">{formatDate(r.receipt_date)}</Link></td>
                    <td className="px-4 py-3 text-right text-zinc-100 tabular-nums"><Link href={`/receipts/${r.id}`} className="hover:underline">{formatDollars(r.total_cents)}</Link></td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/receipts/${r.id}`} className="hover:underline">
                        {r.status === "confirmed" ? (
                          <span className="text-emerald-300 text-xs">Confirmed</span>
                        ) : ocrFailed ? (
                          <span className="text-orange-300 text-xs">Needs manual entry</span>
                        ) : (
                          <span className="text-amber-300 text-xs">Review</span>
                        )}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-zinc-900/30 text-xs">
              <tr>
                <td colSpan={5} className="px-4 py-2 text-zinc-500">{receipts.length} receipt{receipts.length === 1 ? "" : "s"}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
