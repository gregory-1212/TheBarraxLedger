import { type NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// LED-20: recurring-bills cron. Scheduled by vercel.json at 12:00 UTC (~7am CT).
//
// Calls run_recurring_bills() (migration 013), which, for each active template whose
// next_run_at has arrived, generates a DRAFT bill (reminder mode, the default) or a
// PENDING bill (scheduled mode), then advances the template's next_run_at by its
// recurrence_interval. The DB function dedups on (source_template_id, due_date), so a
// same-day re-run is a no-op (idempotent — AC). Generated drafts surface in the Bills
// "Drafts to review" badge for the user to confirm.
//
// Auth: same convention as the reminders cron — verify Bearer CRON_SECRET if it's set
// (unset = publicly invocable, fine for local dev curl; set it in prod to lock it down).

export const runtime = "nodejs";

type GeneratedBill = {
  out_bill_id: string;
  out_template_id: string;
  out_due_date: string;
  out_amount_cents: number;
  out_mode: "reminder" | "scheduled";
};

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const got = request.headers.get("authorization");
    if (got !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  // Service-role: bypass RLS so the cron can read every template + write bills.
  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data, error } = await supabase.rpc("run_recurring_bills");
  if (error) {
    console.error("[recurring-bills] run_recurring_bills failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const generated = (data ?? []) as GeneratedBill[];

  // Diagnostics log (AC: generated bills logged).
  for (const g of generated) {
    console.log(
      `[recurring-bills] generated bill ${g.out_bill_id} from template ${g.out_template_id} ` +
        `due ${g.out_due_date} ($${(g.out_amount_cents / 100).toFixed(2)}, ` +
        `${g.out_mode === "scheduled" ? "pending" : "draft"})`,
    );
  }
  if (generated.length === 0) console.log("[recurring-bills] no templates due — nothing generated.");

  return NextResponse.json({ ok: true, generated: generated.length, bills: generated });
}
