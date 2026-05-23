import { Suspense } from "react";
import {
  DashboardWidget,
  WidgetEmptyState,
  WidgetSkeleton,
} from "@/components/DashboardWidget";
import { UpcomingComplianceWidget } from "@/components/widgets/UpcomingComplianceWidget";
import { CashOutForecastWidget } from "@/components/widgets/CashOutForecastWidget";
import { CalendarGrid } from "@/components/CalendarGrid";
import { CalendarForecastTile } from "@/components/CalendarForecastTile";

// Home page: unified calendar (LED-29) + dashboard widgets.
// Calendar pulls from compliance_items + bills; more sources added as features ship.

type Search = { y?: string; m?: string };

function parseMonth(params: Search): { year: number; month: number } {
  const now = new Date();
  const year = parseInt(params.y ?? "", 10);
  const month = parseInt(params.m ?? "", 10);
  if (!isNaN(year) && !isNaN(month) && month >= 1 && month <= 12) {
    return { year, month };
  }
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const params = await searchParams;
  const { year, month } = parseMonth(params);

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Home</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Calendar of what&apos;s due + dashboard of what needs attention.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 bg-zinc-900 border border-zinc-800 rounded-lg p-5">
          {/* LED-50: cross-source forecast tile above the month grid */}
          <Suspense fallback={null}>
            <CalendarForecastTile />
          </Suspense>
          <Suspense
            fallback={
              <div className="h-96 flex items-center justify-center text-zinc-600 text-sm">
                Loading calendar…
              </div>
            }
          >
            <CalendarGrid year={year} month={month} />
          </Suspense>
        </section>

        {/* Widget order per Julie's feedback (2026-05-22): money-flow widgets
            on top, compliance after. */}
        <aside className="space-y-6">
          <Suspense
            fallback={
              <DashboardWidget title="Money Out — Next 30 Days">
                <WidgetSkeleton />
              </DashboardWidget>
            }
          >
            <CashOutForecastWidget />
          </Suspense>

          <Suspense
            fallback={
              <DashboardWidget title="Compliance — next 30 days">
                <WidgetSkeleton />
              </DashboardWidget>
            }
          >
            <UpcomingComplianceWidget />
          </Suspense>

          <DashboardWidget title="1099 Readiness">
            <WidgetEmptyState>No contractors yet (LED-26 + LED-41).</WidgetEmptyState>
          </DashboardWidget>
        </aside>
      </div>
    </div>
  );
}
