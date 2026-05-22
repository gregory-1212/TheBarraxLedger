import {
  DashboardWidget,
  WidgetEmptyState,
} from "@/components/DashboardWidget";
import { createClient } from "@/utils/supabase/server";

// LED-42: Cash-out forecast tile. Shows $X across N bills due in the next 7
// and 30 days. Excludes paid + draft bills.

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function isoOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function CashOutForecastWidget() {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const in7 = isoOffset(7);
  const in30 = isoOffset(30);

  const [next7Result, next30Result] = await Promise.all([
    supabase
      .from("bills")
      .select("amount_cents")
      .is("deleted_at", null)
      .is("paid_date", null)
      .neq("status", "draft")
      .neq("status", "void")
      .gte("due_date", today)
      .lte("due_date", in7),
    supabase
      .from("bills")
      .select("amount_cents")
      .is("deleted_at", null)
      .is("paid_date", null)
      .neq("status", "draft")
      .neq("status", "void")
      .gte("due_date", today)
      .lte("due_date", in30),
  ]);

  const next7 = next7Result.data ?? [];
  const next30 = next30Result.data ?? [];

  const next7Total = next7.reduce(
    (acc, b) => acc + (b.amount_cents ?? 0),
    0,
  );
  const next30Total = next30.reduce(
    (acc, b) => acc + (b.amount_cents ?? 0),
    0,
  );

  if (next30.length === 0) {
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
            {formatDollars(next7Total)}{" "}
            <span className="text-xs font-normal text-zinc-500">
              ({next7.length} bill{next7.length === 1 ? "" : "s"})
            </span>
          </p>
        </div>
        <div className="pt-2 border-t border-zinc-800">
          <p className="text-xs text-zinc-500">Next 30 days</p>
          <p className="text-lg font-semibold text-zinc-100 tabular-nums">
            {formatDollars(next30Total)}{" "}
            <span className="text-xs font-normal text-zinc-500">
              ({next30.length} bill{next30.length === 1 ? "" : "s"})
            </span>
          </p>
        </div>
      </div>
    </DashboardWidget>
  );
}
