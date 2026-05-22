import {
  DashboardWidget,
  WidgetEmptyState,
  WidgetErrorState,
} from "@/components/DashboardWidget";
import { createClient } from "@/utils/supabase/server";

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function daysUntil(iso: string): number {
  const due = new Date(iso + "T00:00:00").getTime();
  const today = new Date(new Date().toDateString()).getTime();
  return Math.round((due - today) / 86_400_000);
}

// LED-36 severity ramp lite. Full version comes when we ship that issue.
function severityClass(daysAway: number): string {
  if (daysAway < 0) return "text-red-400 font-medium";
  if (daysAway <= 7) return "text-orange-400";
  if (daysAway <= 14) return "text-amber-400";
  return "text-zinc-500";
}

export async function UpcomingComplianceWidget() {
  const supabase = await createClient();
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + 30);
  const horizonIso = horizon.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("compliance_items")
    .select("id, title, jurisdiction, next_due_date")
    .is("deleted_at", null)
    .neq("status", "done")
    .lte("next_due_date", horizonIso)
    .order("next_due_date", { ascending: true })
    .limit(5);

  return (
    <DashboardWidget title="Compliance — next 30 days" href="/compliance">
      {error ? (
        <WidgetErrorState />
      ) : !data || data.length === 0 ? (
        <WidgetEmptyState>Nothing due in the next 30 days.</WidgetEmptyState>
      ) : (
        <ul className="space-y-2">
          {data.map((item) => {
            const days = daysUntil(item.next_due_date);
            return (
              <li
                key={item.id}
                className="flex items-baseline justify-between gap-3"
              >
                <span className="text-zinc-200 truncate">{item.title}</span>
                <span
                  className={`shrink-0 tabular-nums text-xs ${severityClass(days)}`}
                >
                  {formatDate(item.next_due_date)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </DashboardWidget>
  );
}
