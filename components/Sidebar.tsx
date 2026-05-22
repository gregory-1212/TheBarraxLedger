import Link from "next/link";

// Left sidebar with the planned Ledger tabs. Each tab is just a link for now;
// active-state styling and real content come later.
const NAV_ITEMS = [
  { href: "/", label: "Home", icon: "▦" },
  { href: "/compliance", label: "Compliance", icon: "⚖" },
  { href: "/bills", label: "Bills", icon: "$" },
  { href: "/vendors", label: "Vendors", icon: "◌" },
  { href: "/receipts", label: "Receipts", icon: "❑" },
  { href: "/reports", label: "Reports", icon: "▤" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

export default function Sidebar() {
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
          </Link>
        ))}
      </nav>
      <div className="px-4 py-3 border-t border-zinc-800 text-xs text-zinc-600">
        v0.0.1 · scaffold
      </div>
    </aside>
  );
}
