import { Suspense } from "react";
import {
  DashboardWidget,
  WidgetEmptyState,
  WidgetSkeleton,
} from "@/components/DashboardWidget";
import { UpcomingComplianceWidget } from "@/components/widgets/UpcomingComplianceWidget";

// Home page: unified calendar + dashboard widgets.
// Calendar shell is still a placeholder — LED-29 ships the real grid.
// Widgets stream in via Suspense so the page shell renders immediately.

export default function Home() {
  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Home</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Calendar of what&apos;s due + dashboard of what needs attention.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar — takes 2/3 on desktop. Placeholder until LED-29. */}
        <section className="lg:col-span-2 bg-zinc-900 border border-zinc-800 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium">Calendar</h2>
            <div className="flex gap-1 text-xs">
              <button className="px-3 py-1 rounded bg-zinc-800 text-zinc-300">
                Month
              </button>
              <button className="px-3 py-1 rounded text-zinc-500 hover:text-zinc-300">
                Week
              </button>
              <button className="px-3 py-1 rounded text-zinc-500 hover:text-zinc-300">
                Agenda
              </button>
            </div>
          </div>
          <div className="h-96 flex items-center justify-center text-zinc-600 text-sm border border-dashed border-zinc-800 rounded text-center">
            Calendar view coming in LED-29 — will show bills due,
            <br />
            compliance deadlines, contractor renewals, and meetings.
          </div>
        </section>

        {/* Dashboard widgets — 1/3 column on desktop */}
        <aside className="space-y-6">
          <Suspense
            fallback={
              <DashboardWidget title="Compliance — next 30 days">
                <WidgetSkeleton />
              </DashboardWidget>
            }
          >
            <UpcomingComplianceWidget />
          </Suspense>

          {/* Placeholder widgets until their backing features land */}
          <DashboardWidget title="Bills Due This Week">
            <WidgetEmptyState>No bills yet (LED-17 builds this).</WidgetEmptyState>
          </DashboardWidget>

          <DashboardWidget title="Money Out — Next 30 Days">
            <WidgetEmptyState>No bills tracked yet (LED-42).</WidgetEmptyState>
          </DashboardWidget>

          <DashboardWidget title="1099 Readiness">
            <WidgetEmptyState>No contractors yet (LED-26).</WidgetEmptyState>
          </DashboardWidget>
        </aside>
      </div>
    </div>
  );
}
