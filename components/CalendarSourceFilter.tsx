"use client";

import { useEffect, useState } from "react";

// LED-51: Source filter for the home calendar. Doubles as legend AND
// filter — clicking a source toggles visibility of its items in the
// month grid and mobile agenda.
//
// State persists in localStorage at key `ledger.calendar.sources`. The
// component renders <style> rules that hide [data-source=<X>] elements
// when X is unchecked; CalendarGrid adds the data-source attribute to
// every event element.
//
// Initial render = all sources visible (we don't know the persisted
// state on the server). After hydration, useEffect syncs from
// localStorage. Brief flash is acceptable for a low-frequency page.

const STORAGE_KEY = "ledger.calendar.sources";

export type CalendarSourceKey = "compliance" | "bill";

const SOURCE_META: Record<
  CalendarSourceKey,
  { label: string; swatchClass: string }
> = {
  compliance: { label: "Compliance", swatchClass: "bg-violet-500" },
  bill: { label: "Bills", swatchClass: "bg-emerald-500" },
};

export function CalendarSourceFilter({
  counts,
}: {
  counts: Record<CalendarSourceKey, number>;
}) {
  // All visible by default; useEffect syncs from localStorage on mount.
  const [enabled, setEnabled] = useState<Record<CalendarSourceKey, boolean>>({
    compliance: true,
    bill: true,
  });
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<
          Record<CalendarSourceKey, boolean>
        >;
        setEnabled((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      // ignore — localStorage may be blocked
    }
    setHydrated(true);
  }, []);

  function toggle(key: CalendarSourceKey) {
    setEnabled((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }

  function setAll(value: boolean) {
    const next: Record<CalendarSourceKey, boolean> = {
      compliance: value,
      bill: value,
    };
    setEnabled(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }

  const hiddenSelectors = (Object.keys(enabled) as CalendarSourceKey[])
    .filter((k) => !enabled[k])
    .map((k) => `[data-source="${k}"]`)
    .join(", ");

  return (
    <>
      {/* Hide unchecked sources via injected CSS. Both desktop grid + mobile
          agenda use data-source on event elements (set by CalendarGrid). */}
      {hydrated && hiddenSelectors && (
        <style>{`${hiddenSelectors} { display: none !important; }`}</style>
      )}

      <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-zinc-500">
        {(Object.keys(SOURCE_META) as CalendarSourceKey[]).map((key) => {
          const meta = SOURCE_META[key];
          const isOn = enabled[key];
          return (
            <button
              key={key}
              type="button"
              onClick={() => toggle(key)}
              className={
                "flex items-center gap-1.5 cursor-pointer transition-opacity " +
                (isOn ? "opacity-100" : "opacity-40")
              }
              aria-pressed={isOn}
              title={
                isOn
                  ? `Click to hide ${meta.label.toLowerCase()}`
                  : `Click to show ${meta.label.toLowerCase()}`
              }
            >
              <span
                className={
                  "inline-block w-2 h-2 rounded-sm " + meta.swatchClass
                }
              />
              <span className={isOn ? "text-zinc-300" : "text-zinc-500"}>
                {meta.label}
              </span>
              <span className="text-zinc-600 tabular-nums">
                · {counts[key] ?? 0}
              </span>
            </button>
          );
        })}
        <span className="ml-auto flex items-center gap-3 text-zinc-600">
          <button
            type="button"
            onClick={() => setAll(true)}
            className="hover:text-zinc-300"
          >
            Show all
          </button>
          <span>·</span>
          <button
            type="button"
            onClick={() => setAll(false)}
            className="hover:text-zinc-300"
          >
            Hide all
          </button>
        </span>
      </div>
    </>
  );
}
