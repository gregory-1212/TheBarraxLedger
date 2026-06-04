"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

// Responsive app shell. Desktop (md+): the sidebar is static, exactly as before.
// Mobile (<md): the sidebar becomes an off-canvas drawer toggled by a hamburger
// in a top bar, with a tap-to-dismiss backdrop. The Sidebar stays a server
// component (it queries the draft-bill count) and is passed in as `sidebar`.
export default function AppShell({
  sidebar,
  children,
}: {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the drawer after a nav link changes the route.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar — static on desktop, slide-in drawer on mobile */}
      <div
        className={
          "z-50 shrink-0 transition-transform duration-200 ease-out " +
          "fixed inset-y-0 left-0 md:static md:translate-x-0 " +
          (open ? "translate-x-0" : "-translate-x-full")
        }
      >
        {sidebar}
      </div>

      {/* Backdrop (mobile only, when open) */}
      {open && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
        />
      )}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <div className="flex items-center gap-3 border-b border-zinc-800 px-4 py-3 md:hidden">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-md border border-zinc-800 text-zinc-300 hover:bg-zinc-800"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden
            >
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <span className="text-sm font-semibold tracking-tight">
            The Barrax Ledger
          </span>
        </div>

        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
