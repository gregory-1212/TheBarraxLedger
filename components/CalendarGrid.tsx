import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import {
  severityForDate,
  SEVERITY_BG_CLASSES,
} from "@/utils/severity";
import { CalendarSourceFilter } from "@/components/CalendarSourceFilter";

// LED-29: Custom Tailwind month grid. No external calendar dep.
// Renders a 6-row × 7-col grid showing the target month + padding from
// adjacent months. Events fetched server-side from compliance_items + bills.
//
// Mobile (<768px / md): the 7-col grid is hidden and a day-grouped agenda list
// with sticky day headers is shown instead (LED-54).

type Props = {
  year: number;
  month: number; // 1-12
};

type DayCell = {
  date: Date;
  iso: string;
  inMonth: boolean;
  isToday: boolean;
};

type CalEvent = {
  id: string;
  source: "compliance" | "bill";
  title: string;
  date: string;
  href: string;
  status: string;
};

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function toIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function buildGrid(year: number, month: number): DayCell[] {
  const firstOfMonth = new Date(year, month - 1, 1);
  const startOffset = firstOfMonth.getDay(); // 0 = Sunday
  const gridStart = new Date(year, month - 1, 1 - startOffset);

  const today = new Date(new Date().toDateString());
  const todayIso = toIso(today);

  const cells: DayCell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    cells.push({
      date: d,
      iso: toIso(d),
      inMonth: d.getMonth() === month - 1,
      isToday: toIso(d) === todayIso,
    });
  }
  return cells;
}

const SOURCE_COLORS = {
  compliance: "border-l-2 border-l-violet-500",
  bill: "border-l-2 border-l-emerald-500",
} as const;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

async function fetchEvents(
  startIso: string,
  endIso: string,
): Promise<CalEvent[]> {
  const supabase = await createClient();
  const events: CalEvent[] = [];

  const [complianceResult, billsResult] = await Promise.all([
    supabase
      .from("compliance_items")
      .select("id, title, next_due_date, status")
      .is("deleted_at", null)
      .gte("next_due_date", startIso)
      .lte("next_due_date", endIso),
    supabase
      .from("bills")
      .select(
        "id, due_date, paid_date, status, amount_cents, vendor:vendors(name)",
      )
      .is("deleted_at", null)
      .gte("due_date", startIso)
      .lte("due_date", endIso),
  ]);

  for (const item of complianceResult.data ?? []) {
    events.push({
      id: `compliance:${item.id}`,
      source: "compliance",
      title: item.title,
      date: item.next_due_date,
      href: `/compliance/${item.id}`,
      status: item.status,
    });
  }

  for (const bill of (billsResult.data ?? []) as unknown as Array<{
    id: string;
    due_date: string;
    paid_date: string | null;
    status: string;
    amount_cents: number;
    vendor: { name: string } | null;
  }>) {
    const dollars = (bill.amount_cents / 100).toFixed(2);
    const vendor = bill.vendor?.name ?? "Unknown";
    events.push({
      id: `bill:${bill.id}`,
      source: "bill",
      title: `${vendor} $${dollars}`,
      date: bill.due_date,
      href: `/bills?tab=${bill.paid_date ? "paid" : "all"}`,
      status: bill.status,
    });
  }

  events.sort((a, b) => a.date.localeCompare(b.date));
  return events;
}

function monthName(month: number): string {
  return new Date(2000, month - 1, 1).toLocaleDateString("en-US", {
    month: "long",
  });
}

function navUrl(year: number, month: number): string {
  const params = new URLSearchParams({ y: String(year), m: String(month) });
  return `/?${params.toString()}`;
}

export async function CalendarGrid({ year, month }: Props) {
  const cells = buildGrid(year, month);
  const startIso = cells[0].iso;
  const endIso = cells[cells.length - 1].iso;
  const events = await fetchEvents(startIso, endIso);

  // Bucket events by date for O(1) lookup per cell.
  const eventsByDate = new Map<string, CalEvent[]>();
  for (const e of events) {
    const arr = eventsByDate.get(e.date) ?? [];
    arr.push(e);
    eventsByDate.set(e.date, arr);
  }

  // Prev/next month calculation
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const today = new Date();
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth() + 1;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-medium">
          {monthName(month)} {year}
        </h2>
        <div className="print:hidden flex items-center gap-1">
          <Link
            href={navUrl(prevYear, prevMonth)}
            className="px-2 py-1 rounded text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          >
            ← Prev
          </Link>
          <Link
            href={navUrl(todayYear, todayMonth)}
            className="px-2 py-1 rounded text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          >
            Today
          </Link>
          <Link
            href={navUrl(nextYear, nextMonth)}
            className="px-2 py-1 rounded text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          >
            Next →
          </Link>
        </div>
      </div>

      {/* Desktop (>=768px): 7-col grid */}
      <div className="hidden md:block">
        <div className="grid grid-cols-7 gap-px text-xs text-zinc-500 mb-1">
          {WEEKDAYS.map((w) => (
            <div key={w} className="px-2 py-1 text-center">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px bg-zinc-800 rounded-md overflow-hidden border border-zinc-800">
          {cells.map((cell) => {
            const dayEvents = eventsByDate.get(cell.iso) ?? [];
            return (
              <div
                key={cell.iso}
                className={
                  "bg-zinc-950 min-h-[88px] p-1.5 text-xs " +
                  (cell.inMonth ? "" : "opacity-40 ")
                }
              >
                <div
                  className={
                    "flex items-center justify-end mb-1 " +
                    (cell.isToday
                      ? "text-orange-300 font-medium"
                      : "text-zinc-500")
                  }
                >
                  {cell.isToday && (
                    <span className="mr-1 inline-block w-1.5 h-1.5 rounded-full bg-orange-400" />
                  )}
                  {cell.date.getDate()}
                </div>
                <div className="space-y-0.5">
                  {dayEvents.slice(0, 3).map((e) => {
                    const sev = severityForDate(e.date, {
                      paid: e.source === "bill" && e.status === "paid",
                      status: e.status,
                    });
                    return (
                      <Link
                        key={e.id}
                        href={e.href}
                        data-source={e.source}
                        className={
                          "block px-1.5 py-0.5 rounded text-[10px] truncate hover:opacity-80 " +
                          SOURCE_COLORS[e.source] +
                          " " +
                          SEVERITY_BG_CLASSES[sev]
                        }
                        title={e.title}
                      >
                        {e.title}
                      </Link>
                    );
                  })}
                  {dayEvents.length > 3 && (
                    <p className="text-[10px] text-zinc-500 px-1.5">
                      +{dayEvents.length - 3} more
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* LED-51: Source filter — legend + click-to-hide toggles, localStorage-persisted */}
        <CalendarSourceFilter
          counts={{
            compliance: events.filter((e) => e.source === "compliance").length,
            bill: events.filter((e) => e.source === "bill").length,
          }}
        />
      </div>

      {/* Mobile (<768px): day-grouped agenda with sticky day headers (LED-54) */}
      <div className="md:hidden">
        {(() => {
          const monthEvents = events.filter(
            (e) => e.date.slice(0, 7) === `${year}-${pad(month)}`,
          );
          if (monthEvents.length === 0) {
            return (
              <p className="text-sm text-zinc-600 text-center py-8">
                Nothing scheduled this month.
              </p>
            );
          }
          // events arrive sorted ascending — group consecutive ones by day.
          const byDay = new Map<string, CalEvent[]>();
          for (const e of monthEvents) {
            const arr = byDay.get(e.date) ?? [];
            arr.push(e);
            byDay.set(e.date, arr);
          }
          const todayIso = toIso(new Date(new Date().toDateString()));
          return [...byDay.entries()].map(([iso, dayEvents]) => {
            const d = new Date(iso + "T00:00:00");
            const isToday = iso === todayIso;
            return (
              <section key={iso}>
                <h3
                  className={
                    "sticky top-0 z-10 -mx-1 px-1 py-1.5 mb-1.5 text-xs font-medium border-b border-zinc-800 bg-zinc-950/95 backdrop-blur " +
                    (isToday ? "text-orange-300" : "text-zinc-400")
                  }
                >
                  {isToday && (
                    <span className="mr-1.5 inline-block w-1.5 h-1.5 rounded-full bg-orange-400 align-middle" />
                  )}
                  {d.toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </h3>
                <ul className="space-y-1.5 mb-3">
                  {dayEvents.map((e) => {
                    const sev = severityForDate(e.date, {
                      paid: e.source === "bill" && e.status === "paid",
                      status: e.status,
                    });
                    return (
                      <li key={e.id} data-source={e.source}>
                        <Link
                          href={e.href}
                          className={
                            "flex items-center justify-between gap-2 rounded-md px-3 py-2.5 text-sm border-l-2 " +
                            SOURCE_COLORS[e.source] +
                            " " +
                            SEVERITY_BG_CLASSES[sev]
                          }
                        >
                          <span className="truncate">{e.title}</span>
                          <span className="shrink-0 text-[10px] uppercase tracking-wide opacity-60">
                            {e.source}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          });
        })()}
      </div>
    </div>
  );
}
