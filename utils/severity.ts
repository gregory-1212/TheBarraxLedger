// LED-36: Deadline severity color ramp.
// Linear's pattern — gray → yellow → orange → red as a due date approaches.
// Used by: compliance index/detail, bills index, calendar events, dashboard widgets.
//
// The ramp is conservative for compliance (90/30/14/7/today/overdue) because
// FFL renewal needs the 90-day window (per ATF Form 8 cadence).

export type Severity = "future" | "soon" | "warn" | "urgent" | "today" | "overdue" | "done";

export function severityForDate(
  isoDate: string,
  opts: { paid?: boolean; status?: string } = {},
): Severity {
  if (opts.paid || opts.status === "done" || opts.status === "paid") {
    return "done";
  }
  const due = new Date(isoDate + "T00:00:00").getTime();
  const today = new Date(new Date().toDateString()).getTime();
  const days = Math.round((due - today) / 86_400_000);

  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days <= 7) return "urgent";
  if (days <= 14) return "warn";
  if (days <= 30) return "soon";
  return "future";
}

// Text color classes (use on the date label or icon).
export const SEVERITY_TEXT_CLASSES: Record<Severity, string> = {
  future: "text-zinc-400",
  soon: "text-zinc-300",
  warn: "text-amber-300",
  urgent: "text-orange-300",
  today: "text-orange-300 font-medium",
  overdue: "text-red-300 font-medium",
  done: "text-zinc-500",
};

// Row tint classes (use on the table row or card background).
export const SEVERITY_ROW_CLASSES: Record<Severity, string> = {
  future: "hover:bg-zinc-900",
  soon: "hover:bg-zinc-900",
  warn: "bg-amber-950/20 hover:bg-amber-950/30",
  urgent: "bg-amber-950/20 hover:bg-amber-950/30",
  today: "bg-orange-950/25 hover:bg-orange-950/35",
  overdue: "bg-red-950/30 hover:bg-red-950/40",
  done: "opacity-60 hover:bg-zinc-900",
};

// Solid-bg classes (use on calendar event chips where the chip itself is colored).
export const SEVERITY_BG_CLASSES: Record<Severity, string> = {
  future: "bg-zinc-800 text-zinc-300",
  soon: "bg-zinc-700 text-zinc-100",
  warn: "bg-amber-900/60 text-amber-100",
  urgent: "bg-orange-900/70 text-orange-100",
  today: "bg-orange-800 text-orange-50",
  overdue: "bg-red-900 text-red-50",
  done: "bg-zinc-800/50 text-zinc-500 line-through",
};

// "in 3 days" / "5 days overdue" / "today" / "paid"
export function relativeDueLabel(
  isoDate: string,
  opts: { paid?: boolean } = {},
): string {
  if (opts.paid) return "paid";
  const due = new Date(isoDate + "T00:00:00").getTime();
  const today = new Date(new Date().toDateString()).getTime();
  const days = Math.round((due - today) / 86_400_000);

  if (days < 0)
    return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`;
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}
