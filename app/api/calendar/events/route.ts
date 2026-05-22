import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

// LED-30: Calendar event aggregator.
// GET /api/calendar/events?start=2026-05-01&end=2026-05-31&sources=compliance,bill
//
// Returns a flat array of events from every requested source, sorted by date.
// Frontend (LED-29 calendar shell) consumes this for the month grid.

export type CalendarEvent = {
  id: string;             // sourcePrefix:uuid
  source: "compliance" | "bill";
  title: string;
  date: string;           // YYYY-MM-DD
  href: string;           // link to source detail
  status?: string;
  amount_cents?: number;
};

const ALL_SOURCES = ["compliance", "bill"] as const;
type Source = (typeof ALL_SOURCES)[number];

function isValidDate(s: string | null): boolean {
  if (!s) return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const start = params.get("start");
  const end = params.get("end");

  if (!isValidDate(start) || !isValidDate(end)) {
    return NextResponse.json(
      { error: "start and end must be YYYY-MM-DD" },
      { status: 400 },
    );
  }

  const sourcesParam = params.get("sources");
  const sources: Source[] = sourcesParam
    ? (sourcesParam
        .split(",")
        .map((s) => s.trim())
        .filter((s) => ALL_SOURCES.includes(s as Source)) as Source[])
    : [...ALL_SOURCES];

  const events: CalendarEvent[] = [];

  // Compliance items — next_due_date within window, not done.
  if (sources.includes("compliance")) {
    const { data } = await supabase
      .from("compliance_items")
      .select("id, title, next_due_date, status")
      .is("deleted_at", null)
      .gte("next_due_date", start)
      .lte("next_due_date", end)
      .order("next_due_date", { ascending: true });

    for (const item of data ?? []) {
      events.push({
        id: `compliance:${item.id}`,
        source: "compliance",
        title: item.title,
        date: item.next_due_date,
        href: `/compliance/${item.id}`,
        status: item.status,
      });
    }
  }

  // Bills — due_date within window (regardless of paid status; paid bills
  // still show on their original due_date with a 'done' style).
  if (sources.includes("bill")) {
    const { data } = await supabase
      .from("bills")
      .select(
        "id, due_date, paid_date, status, amount_cents, vendor:vendors(name)",
      )
      .is("deleted_at", null)
      .gte("due_date", start)
      .lte("due_date", end)
      .order("due_date", { ascending: true });

    for (const bill of (data ?? []) as unknown as Array<{
      id: string;
      due_date: string;
      paid_date: string | null;
      status: string;
      amount_cents: number;
      vendor: { name: string } | null;
    }>) {
      const vendorName = bill.vendor?.name ?? "Unknown vendor";
      const dollars = (bill.amount_cents / 100).toFixed(2);
      events.push({
        id: `bill:${bill.id}`,
        source: "bill",
        title: `${vendorName} — $${dollars}`,
        date: bill.due_date,
        href: `/bills?tab=${bill.paid_date ? "paid" : "all"}`,
        status: bill.status,
        amount_cents: bill.amount_cents,
      });
    }
  }

  events.sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json({ events });
}
