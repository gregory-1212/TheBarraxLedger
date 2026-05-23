// LED-50: shared forecast helper for cross-source "money out" aggregation.
//
// Used by two callers today:
//   - CashOutForecastWidget (right sidebar on home) — bills-only by default
//   - CalendarForecastTile (above the calendar grid) — bills + compliance
//
// Add new sources by extending ForecastSource and the SOURCE_FETCHERS map.
// Future: 1099 deliveries (LED-45), recurring bills (LED-20).

import { type SupabaseClient } from "@supabase/supabase-js";

export type ForecastSource = "bills" | "compliance";

export type ForecastResult = {
  totalCents: number;
  itemCount: number;
  bySource: Record<ForecastSource, { totalCents: number; itemCount: number }>;
};

/**
 * Sum "money out" across the given sources for due_date / next_due_date
 * within [startISO, endISO] inclusive. Excludes paid bills (paid_date IS
 * NOT NULL) and drafts/voids; excludes compliance items already "done" or
 * with no associated cost.
 *
 * Dates are ISO `YYYY-MM-DD`. Both bounds are inclusive — call with the
 * same date twice to forecast a single day.
 */
export async function forecastBetween(
  supabase: SupabaseClient,
  startISO: string,
  endISO: string,
  options: { sources?: ForecastSource[] } = {},
): Promise<ForecastResult> {
  const sources = options.sources ?? ["bills", "compliance"];

  const bySource: ForecastResult["bySource"] = {
    bills: { totalCents: 0, itemCount: 0 },
    compliance: { totalCents: 0, itemCount: 0 },
  };

  await Promise.all(
    sources.map(async (s) => {
      bySource[s] = await SOURCE_FETCHERS[s](supabase, startISO, endISO);
    }),
  );

  const totalCents = sources.reduce(
    (acc, s) => acc + bySource[s].totalCents,
    0,
  );
  const itemCount = sources.reduce(
    (acc, s) => acc + bySource[s].itemCount,
    0,
  );

  return { totalCents, itemCount, bySource };
}

const SOURCE_FETCHERS: Record<
  ForecastSource,
  (
    supabase: SupabaseClient,
    startISO: string,
    endISO: string,
  ) => Promise<{ totalCents: number; itemCount: number }>
> = {
  bills: async (supabase, startISO, endISO) => {
    const { data, error } = await supabase
      .from("bills")
      .select("amount_cents")
      .is("deleted_at", null)
      .is("paid_date", null)
      .neq("status", "draft")
      .neq("status", "void")
      .gte("due_date", startISO)
      .lte("due_date", endISO);
    if (error) throw new Error(`bills forecast: ${error.message}`);
    const rows = (data ?? []) as Array<{ amount_cents: number | null }>;
    return {
      totalCents: rows.reduce((acc, b) => acc + (b.amount_cents ?? 0), 0),
      itemCount: rows.length,
    };
  },

  compliance: async (supabase, startISO, endISO) => {
    // Only compliance items that actually cost money. Reminders/$0 filings
    // don't belong in a money-out forecast.
    const { data, error } = await supabase
      .from("compliance_items")
      .select("cost_cents")
      .is("deleted_at", null)
      .neq("status", "done")
      .not("cost_cents", "is", null)
      .gt("cost_cents", 0)
      .gte("next_due_date", startISO)
      .lte("next_due_date", endISO);
    if (error) throw new Error(`compliance forecast: ${error.message}`);
    const rows = (data ?? []) as Array<{ cost_cents: number | null }>;
    return {
      totalCents: rows.reduce((acc, c) => acc + (c.cost_cents ?? 0), 0),
      itemCount: rows.length,
    };
  },
};

/**
 * Helper: today + N days as `YYYY-MM-DD`.
 */
export function isoDaysFromNow(days: number, today: Date = new Date()): string {
  const d = new Date(today);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Helper: today as `YYYY-MM-DD`.
 */
export function isoToday(today: Date = new Date()): string {
  return today.toISOString().slice(0, 10);
}
