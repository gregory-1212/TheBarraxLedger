// Home page: the planned "Calendar + Dashboard combined" view.
// Currently shows placeholder layout — no real data, no actual calendar yet.

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
        {/* Calendar — takes 2/3 on desktop */}
        <section className="lg:col-span-2 bg-zinc-900 border border-zinc-800 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium">Calendar</h2>
            <div className="flex gap-1 text-xs">
              <button className="px-3 py-1 rounded bg-zinc-800 text-zinc-300">Month</button>
              <button className="px-3 py-1 rounded text-zinc-500 hover:text-zinc-300">Week</button>
              <button className="px-3 py-1 rounded text-zinc-500 hover:text-zinc-300">Agenda</button>
            </div>
          </div>
          <div className="h-96 flex items-center justify-center text-zinc-600 text-sm border border-dashed border-zinc-800 rounded text-center">
            Calendar view coming soon — will show bills due, compliance deadlines,
            <br />contractor renewals, member meetings, and reminders.
          </div>
        </section>

        {/* Dashboard widgets — takes 1/3 on desktop */}
        <aside className="space-y-6">
          {/* Compliance scorecard */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
            <h3 className="text-sm font-medium text-zinc-400 mb-3 uppercase tracking-wide">
              Compliance Status
            </h3>
            <div className="text-3xl font-semibold text-zinc-500">—</div>
            <p className="text-xs text-zinc-600 mt-2">
              In-good-standing indicator across NV + TN. No data yet.
            </p>
          </div>

          {/* Due this week */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
            <h3 className="text-sm font-medium text-zinc-400 mb-3 uppercase tracking-wide">
              Due This Week
            </h3>
            <p className="text-sm text-zinc-600">Nothing scheduled yet.</p>
          </div>

          {/* Overdue */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
            <h3 className="text-sm font-medium text-zinc-400 mb-3 uppercase tracking-wide">
              Overdue
            </h3>
            <p className="text-sm text-zinc-600">None.</p>
          </div>

          {/* This month's spend */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
            <h3 className="text-sm font-medium text-zinc-400 mb-3 uppercase tracking-wide">
              This Month
            </h3>
            <div className="text-2xl font-semibold text-zinc-500 tabular-nums">$—</div>
            <p className="text-xs text-zinc-600 mt-2">Total spend (placeholder).</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
