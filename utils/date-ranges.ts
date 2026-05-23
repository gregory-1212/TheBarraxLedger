// LED-52: Date range presets — Xero canonical list.
//
// Pure functions that translate a preset name → { from, to } ISO strings.
// Bounds are inclusive on both ends. "Today" anchors are explicit so this
// is server-component safe (no Date.now() drift between SSR + client).

export type DateRangePreset =
  | "this-month"
  | "last-month"
  | "this-quarter"
  | "last-quarter"
  | "ytd"
  | "last-year"
  | "custom";

export const DATE_RANGE_PRESET_LABELS: Record<DateRangePreset, string> = {
  "this-month": "This Month",
  "last-month": "Last Month",
  "this-quarter": "This Quarter",
  "last-quarter": "Last Quarter",
  ytd: "YTD",
  "last-year": "Last Year",
  custom: "Custom",
};

// Display order for the preset picker. YTD is the default per LED-52.
export const DATE_RANGE_PRESET_ORDER: DateRangePreset[] = [
  "this-month",
  "last-month",
  "this-quarter",
  "last-quarter",
  "ytd",
  "last-year",
  "custom",
];

export type DateRange = { from: string; to: string };

/**
 * Resolve a preset to an inclusive { from, to } pair in ISO `YYYY-MM-DD`
 * format. "custom" returns the from/to args as-is; the rest derive from
 * the `today` anchor (defaults to now).
 *
 * Inclusive bounds: `to` is the last calendar day of the range, not the
 * first day of the following period. Match against e.g. `paid_date >= from
 * AND paid_date <= to`.
 */
export function resolvePreset(
  preset: DateRangePreset,
  args: { from?: string; to?: string; today?: Date } = {},
): DateRange {
  const today = args.today ?? new Date();
  const yyyy = today.getFullYear();
  const m = today.getMonth(); // 0-based
  const q = Math.floor(m / 3); // 0..3

  switch (preset) {
    case "this-month":
      return monthRange(yyyy, m);
    case "last-month": {
      const prev = m === 0 ? { y: yyyy - 1, mo: 11 } : { y: yyyy, mo: m - 1 };
      return monthRange(prev.y, prev.mo);
    }
    case "this-quarter":
      return quarterRange(yyyy, q);
    case "last-quarter": {
      const prev = q === 0 ? { y: yyyy - 1, qu: 3 } : { y: yyyy, qu: q - 1 };
      return quarterRange(prev.y, prev.qu);
    }
    case "ytd":
      return { from: iso(yyyy, 0, 1), to: iso(yyyy, m, today.getDate()) };
    case "last-year":
      return { from: iso(yyyy - 1, 0, 1), to: iso(yyyy - 1, 11, 31) };
    case "custom":
      // Fall through to the args. Caller is responsible for sanity.
      return {
        from: args.from ?? iso(yyyy, 0, 1),
        to: args.to ?? iso(yyyy, m, today.getDate()),
      };
  }
}

/**
 * Pick the preset that matches a given { from, to } if any, else "custom".
 * Useful for hydrating a picker from URL params: if the user landed via
 * /reports?from=2026-01-01&to=2026-03-31 and that exactly matches Q1, we
 * highlight the "This Quarter" chip instead of "Custom".
 */
export function detectPreset(
  range: DateRange,
  today: Date = new Date(),
): DateRangePreset {
  for (const p of DATE_RANGE_PRESET_ORDER) {
    if (p === "custom") continue;
    const candidate = resolvePreset(p, { today });
    if (candidate.from === range.from && candidate.to === range.to) return p;
  }
  return "custom";
}

function monthRange(year: number, month0: number): DateRange {
  const firstDay = iso(year, month0, 1);
  const lastDay = iso(year, month0, daysInMonth(year, month0));
  return { from: firstDay, to: lastDay };
}

function quarterRange(year: number, quarter0: number): DateRange {
  const startMonth = quarter0 * 3;
  const endMonth = startMonth + 2;
  return {
    from: iso(year, startMonth, 1),
    to: iso(year, endMonth, daysInMonth(year, endMonth)),
  };
}

function daysInMonth(year: number, month0: number): number {
  // Day 0 of the next month is the last day of the current month.
  return new Date(year, month0 + 1, 0).getDate();
}

function iso(year: number, month0: number, day: number): string {
  const m = String(month0 + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}
