import { type NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { sendEmail, type SendEmailResult } from "@/utils/send-email";

// LED-12 + LED-21: daily reminder cron.
//
// Scheduled by vercel.json at 13:00 UTC (8am CT). Two horizons: items due
// in 7 days (early warning) and items due in 1 day (last call). Each
// horizon sends one email per source (compliance / bills) containing the
// list of items at that horizon. The reminder_sends table tracks
// (entity, horizon) so re-runs are idempotent.
//
// Auth: Vercel signs cron requests with `Authorization: Bearer <CRON_SECRET>`
// when CRON_SECRET is set in the project. We verify if it's set; if not,
// we still process (covers local dev curl tests). In production, leaving
// CRON_SECRET unset means the route is publicly invocable — fine for a
// read-mostly reminder cron, but consider setting it.

export const runtime = "nodejs";

const HORIZONS_DAYS = [7, 1] as const;
const RECIPIENTS = ["greg@thebarrax.com", "julie@thebarrax.com"];

type DueItem = {
  id: string;
  label: string;
  due_date: string;
  amount_cents: number | null;
  detail_url: string;
};

function isoOffset(days: number, base: Date = new Date()): string {
  const d = new Date(base);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDate(iso: string): string {
  // Sat, Jun 1
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatDollars(cents: number | null): string {
  if (cents === null) return "";
  return `$${(cents / 100).toFixed(2)}`;
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const got = request.headers.get("authorization");
    if (got !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  // Use service-role: bypass RLS so the cron sees every row, can write to
  // reminder_sends. is_staff() RLS doesn't apply to server cron context.
  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const today = isoOffset(0);
  const summary: Array<{
    horizon: number;
    compliance: number;
    bills: number;
    emailResult: SendEmailResult | null;
  }> = [];

  for (const horizon of HORIZONS_DAYS) {
    const targetDate = isoOffset(horizon);

    // Compliance items due exactly N days from today, not already done.
    const { data: complianceRows } = await supabase
      .from("compliance_items")
      .select("id, title, jurisdiction, next_due_date, cost_cents")
      .neq("status", "done")
      .is("deleted_at", null)
      .eq("next_due_date", targetDate);

    // Bills due exactly N days from today, not paid, not draft/void.
    const { data: billRows } = await supabase
      .from("bills")
      .select(
        "id, due_date, amount_cents, reference, vendor:vendors(name), expense_category:expense_categories(name)",
      )
      .is("deleted_at", null)
      .is("paid_date", null)
      .neq("status", "draft")
      .neq("status", "void")
      .eq("due_date", targetDate);

    // Filter out items we already sent a reminder for at this horizon.
    const allComplianceIds = (complianceRows ?? []).map((c: any) => c.id);
    const allBillIds = (billRows ?? []).map((b: any) => b.id);

    const { data: alreadySent } = await supabase
      .from("reminder_sends")
      .select("entity_type, entity_id")
      .eq("horizon_days", horizon)
      .in("entity_id", [...allComplianceIds, ...allBillIds]);

    const sentSet = new Set(
      (alreadySent ?? []).map(
        (r: any) => `${r.entity_type}:${r.entity_id}`,
      ),
    );

    const complianceItems: DueItem[] = (complianceRows ?? [])
      .filter((c: any) => !sentSet.has(`compliance_item:${c.id}`))
      .map((c: any) => ({
        id: c.id,
        label: c.jurisdiction
          ? `${c.title} — ${c.jurisdiction}`
          : c.title,
        due_date: c.next_due_date,
        amount_cents: c.cost_cents ?? null,
        detail_url: `https://ledger.thebarrax.com/compliance/${c.id}`,
      }));

    const billItems: DueItem[] = (billRows ?? [])
      .filter((b: any) => !sentSet.has(`bill:${b.id}`))
      .map((b: any) => {
        const vendor = Array.isArray(b.vendor) ? b.vendor[0] : b.vendor;
        const cat = Array.isArray(b.expense_category)
          ? b.expense_category[0]
          : b.expense_category;
        const refSuffix = b.reference ? ` · ${b.reference}` : "";
        return {
          id: b.id,
          label: `${vendor?.name ?? "(unknown vendor)"} — ${cat?.name ?? "Uncategorized"}${refSuffix}`,
          due_date: b.due_date,
          amount_cents: b.amount_cents ?? null,
          detail_url: `https://ledger.thebarrax.com/bills/${b.id}`,
        };
      });

    if (complianceItems.length === 0 && billItems.length === 0) {
      summary.push({
        horizon,
        compliance: 0,
        bills: 0,
        emailResult: null,
      });
      continue;
    }

    const horizonLabel =
      horizon === 1 ? "tomorrow" : `in ${horizon} days`;
    const totalCount = complianceItems.length + billItems.length;
    const subject = `Ledger: ${totalCount} item${totalCount === 1 ? "" : "s"} due ${horizonLabel}`;

    const { html, text } = buildEmail({
      horizonLabel,
      targetDate,
      compliance: complianceItems,
      bills: billItems,
    });

    const emailResult = await sendEmail({
      to: RECIPIENTS,
      subject,
      html,
      text,
    });

    // Whether the email send succeeded or was skipped (no API key), record
    // reminder_sends so we don't re-process the same items tomorrow. If
    // send genuinely failed (network/4xx/5xx), skip the insert so the next
    // run retries.
    const insertable = emailResult.ok || (!emailResult.ok && emailResult.skipped);
    if (insertable) {
      const rows = [
        ...complianceItems.map((c) => ({
          entity_type: "compliance_item",
          entity_id: c.id,
          horizon_days: horizon,
          sent_to: RECIPIENTS,
        })),
        ...billItems.map((b) => ({
          entity_type: "bill",
          entity_id: b.id,
          horizon_days: horizon,
          sent_to: RECIPIENTS,
        })),
      ];
      if (rows.length > 0) {
        await (supabase.from("reminder_sends") as any)
          .upsert(rows, {
            onConflict: "entity_type,entity_id,horizon_days",
            ignoreDuplicates: true,
          });
      }
    }

    summary.push({
      horizon,
      compliance: complianceItems.length,
      bills: billItems.length,
      emailResult,
    });
  }

  return NextResponse.json({
    ok: true,
    ran_at: new Date().toISOString(),
    today,
    summary,
  });
}

function buildEmail(args: {
  horizonLabel: string;
  targetDate: string;
  compliance: DueItem[];
  bills: DueItem[];
}): { html: string; text: string } {
  const total = args.compliance.length + args.bills.length;
  const dateStr = formatDate(args.targetDate);

  // Plain text fallback.
  const lines: string[] = [];
  lines.push(`${total} item${total === 1 ? "" : "s"} due ${args.horizonLabel} (${dateStr}):`);
  lines.push("");
  if (args.compliance.length > 0) {
    lines.push(`COMPLIANCE (${args.compliance.length})`);
    for (const c of args.compliance) {
      const amt = c.amount_cents !== null ? ` — ${formatDollars(c.amount_cents)}` : "";
      lines.push(`  • ${c.label}${amt}`);
      lines.push(`    ${c.detail_url}`);
    }
    lines.push("");
  }
  if (args.bills.length > 0) {
    lines.push(`BILLS (${args.bills.length})`);
    for (const b of args.bills) {
      const amt = b.amount_cents !== null ? ` — ${formatDollars(b.amount_cents)}` : "";
      lines.push(`  • ${b.label}${amt}`);
      lines.push(`    ${b.detail_url}`);
    }
    lines.push("");
  }
  lines.push("— The Barrax Ledger");

  // Simple inline-styled HTML — Resend/Gmail strip <style> blocks.
  const liStyle =
    "padding:8px 0;border-bottom:1px solid #eee;font-size:14px;color:#222;";
  const linkStyle = "color:#1d4ed8;text-decoration:none;";
  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#222;">
  <h2 style="margin:0 0 4px;font-size:18px;">
    ${total} item${total === 1 ? "" : "s"} due ${args.horizonLabel}
  </h2>
  <p style="margin:0 0 24px;color:#666;font-size:13px;">${dateStr}</p>

  ${
    args.compliance.length > 0
      ? `
    <h3 style="margin:24px 0 8px;font-size:13px;color:#888;text-transform:uppercase;letter-spacing:0.05em;">
      Compliance · ${args.compliance.length}
    </h3>
    <ul style="list-style:none;padding:0;margin:0;">
      ${args.compliance
        .map(
          (c) => `<li style="${liStyle}">
        <a href="${c.detail_url}" style="${linkStyle}">${escape(c.label)}</a>
        ${
          c.amount_cents !== null
            ? `<span style="float:right;color:#444;">${formatDollars(c.amount_cents)}</span>`
            : ""
        }
      </li>`,
        )
        .join("")}
    </ul>
  `
      : ""
  }

  ${
    args.bills.length > 0
      ? `
    <h3 style="margin:24px 0 8px;font-size:13px;color:#888;text-transform:uppercase;letter-spacing:0.05em;">
      Bills · ${args.bills.length}
    </h3>
    <ul style="list-style:none;padding:0;margin:0;">
      ${args.bills
        .map(
          (b) => `<li style="${liStyle}">
        <a href="${b.detail_url}" style="${linkStyle}">${escape(b.label)}</a>
        ${
          b.amount_cents !== null
            ? `<span style="float:right;color:#444;">${formatDollars(b.amount_cents)}</span>`
            : ""
        }
      </li>`,
        )
        .join("")}
    </ul>
  `
      : ""
  }

  <p style="margin:32px 0 0;font-size:12px;color:#888;">
    Sent automatically by The Barrax Ledger reminder cron.
  </p>
</div>`.trim();

  return { html, text: lines.join("\n") };
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
