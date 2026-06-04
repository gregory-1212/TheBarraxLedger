import Link from "next/link";
import { createClient } from "@/utils/supabase/server";

// Left sidebar with the planned Ledger tabs. Each tab is just a link for now;
// active-state styling and real content come later.
// Order per Julie's frequency-of-use feedback (2026-05-22): most-used at top.
const NAV_ITEMS = [
  { href: "/", label: "Home", icon: "▦" },
  { href: "/bills", label: "Bills", icon: "$" },
  { href: "/receipts", label: "Receipts", icon: "❑" },
  { href: "/compliance", label: "Compliance", icon: "⚖" },
  { href: "/reports", label: "Reports", icon: "▤" },
  { href: "/vendors", label: "Vendors", icon: "◌" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

export default async function Sidebar() {
  // LED-20: "drafts to review" badge on Bills. The recurring-bills cron creates
  // bills with status='draft' awaiting confirmation; surface the count so Julie
  // knows to review them. Best-effort — never block the nav render.
  let draftCount = 0;
  try {
    const supabase = await createClient();
    const { count } = await supabase
      .from("bills")
      .select("id", { count: "exact", head: true })
      .eq("status", "draft")
      .is("deleted_at", null);
    draftCount = count ?? 0;
  } catch {
    /* badge is best-effort; a query error must not break navigation */
  }

  return (
    <aside className="w-56 shrink-0 bg-zinc-900 border-r border-zinc-800 flex flex-col">
      <div className="px-5 py-5 border-b border-zinc-800">
        <h1 className="text-base font-semibold tracking-tight">
          The Barrax Ledger
        </h1>
        <p className="text-xs text-zinc-500 mt-0.5">
          Back-office operations
        </p>
      </div>
      <nav className="flex-1 px-2 py-3">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
          >
            <span className="w-4 text-center text-zinc-500">{item.icon}</span>
            <span>{item.label}</span>
            {item.href === "/bills" && draftCount > 0 && (
              <span
                className="ml-auto inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-[2px] bg-[#806D40] text-zinc-950 text-[11px] font-semibold tabular-nums"
                title={`${draftCount} draft bill${draftCount === 1 ? "" : "s"} to review`}
                aria-label={`${draftCount} draft bills to review`}
              >
                {draftCount}
              </span>
            )}
          </Link>
        ))}
      </nav>
      <div className="px-4 py-3 border-t border-zinc-800 text-xs text-zinc-600">
        v0.0.1 · scaffold
      </div>
    </aside>
  );
}
