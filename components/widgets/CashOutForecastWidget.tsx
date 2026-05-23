import {
  DashboardWidget,
  WidgetEmptyState,
} from "@/components/DashboardWidget";
import { createClient } from "@/utils/supabase/server";
import { forecastBetween, isoDaysFromNow, isoToday } from "@/utils/forecast";

// LED-42: Cash-out forecast tile. Bills-only by design — sits beside the
// Compliance widget which carries that source. The cross-source unified
// tile lives above the calendar grid (LED-50, CalendarForecastTile).

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export async function CashOutForecastWidget() {
  const supabase = await createClient();
  const today = isoToday();
  const in7 = isoDaysFromNow(7);
  const in30 = isoDaysFromNow(30);

  const [next7, next30] = await Promise.all([
    forecastBetween(supabase, today, in7, { sources: ["bills"] }),
    forecastBetween(supabase, today, in30, { sources: ["bills"] }),
  ]);

  if (next30.itemCount === 0) {
    return (
      <DashboardWidget title="Money Out — Next 30 Days" href="/bills">
        <WidgetEmptyState>$0 due in the next 30 days.</WidgetEmptyState>
      </DashboardWidget>
    );
  }

  return (
    <DashboardWidget title="Money Out — Next 30 Days" href="/bills">
      <div className="space-y-2">
        <div>
          <p className="text-xs text-zinc-500">Next 7 days</p>
          <p className="text-lg font-semibold text-zinc-100 tabular-nums">
            {formatDollars(next7.totalCents)}{" "}
            <span className="text-xs font-normal text-zinc-500">
              ({next7.itemCount} bill{next7.itemCount === 1 ? "" : "s"})
            </span>
          </p>
        </div>
        <div className="pt-2 border-t border-zinc-800">
          <p className="text-xs text-zinc-500">Next 30 days</p>
          <p className="text-lg font-semibold text-zinc-100 tabular-nums">
            {formatDollars(next30.totalCents)}{" "}
            <span className="text-xs font-normal text-zinc-500">
              ({next30.itemCount} bill{next30.itemCount === 1 ? "" : "s"})
            </span>
          </p>
        </div>
      </div>
    </DashboardWidget>
  );
}
