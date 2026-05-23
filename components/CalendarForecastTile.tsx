import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { forecastBetween, isoDaysFromNow, isoToday } from "@/utils/forecast";

// LED-50: Calendar header forecast tile. Sits above the month grid and
// summarizes ALL money-out across the next 30 days — bills + compliance
// (1099 deliveries to follow when LED-45 lands).
//
// Two renders:
//   - Desktop (sm+): full tile with separate bills + compliance breakdowns
//   - Mobile: single-line summary above the calendar agenda
// Click target: /bills?tab=due (the existing "Due Soon" tab). Once the
// calendar grows a ?view=agenda filter, swap to that.

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export async function CalendarForecastTile() {
  const supabase = await createClient();
  const next30 = await forecastBetween(
    supabase,
    isoToday(),
    isoDaysFromNow(30),
  );

  if (next30.itemCount === 0) {
    return (
      <Link
        href="/bills?tab=due"
        className="block rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3 mb-4 text-sm text-zinc-500 hover:border-zinc-700 transition-colors"
      >
        Nothing due in the next 30 days.
      </Link>
    );
  }

  const billsTotal = next30.bySource.bills.totalCents;
  const billsCount = next30.bySource.bills.itemCount;
  const compTotal = next30.bySource.compliance.totalCents;
  const compCount = next30.bySource.compliance.itemCount;

  return (
    <Link
      href="/bills?tab=due"
      className="block mb-4 rounded-lg border border-zinc-800 bg-zinc-950 hover:border-zinc-700 transition-colors"
    >
      {/* Desktop */}
      <div className="hidden sm:flex items-baseline gap-6 px-4 py-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">
            Money out · next 30 days
          </p>
          <p className="text-xl font-semibold text-zinc-100 tabular-nums">
            {formatDollars(next30.totalCents)}{" "}
            <span className="text-xs font-normal text-zinc-500">
              across {next30.itemCount} item{next30.itemCount === 1 ? "" : "s"}
            </span>
          </p>
        </div>
        {billsCount > 0 && (
          <div className="border-l border-zinc-800 pl-6">
            <p className="text-xs text-zinc-500">Bills</p>
            <p className="text-sm text-zinc-300 tabular-nums">
              {formatDollars(billsTotal)}{" "}
              <span className="text-xs text-zinc-500">
                · {billsCount}
              </span>
            </p>
          </div>
        )}
        {compCount > 0 && (
          <div className="border-l border-zinc-800 pl-6">
            <p className="text-xs text-zinc-500">Compliance</p>
            <p className="text-sm text-zinc-300 tabular-nums">
              {formatDollars(compTotal)}{" "}
              <span className="text-xs text-zinc-500">
                · {compCount}
              </span>
            </p>
          </div>
        )}
      </div>

      {/* Mobile: single-line collapse */}
      <div className="sm:hidden px-4 py-2 flex items-baseline justify-between gap-3 text-sm">
        <span className="text-zinc-400">
          Next 30 days · {next30.itemCount} item{next30.itemCount === 1 ? "" : "s"}
        </span>
        <span className="text-zinc-100 font-semibold tabular-nums">
          {formatDollars(next30.totalCents)}
        </span>
      </div>
    </Link>
  );
}
