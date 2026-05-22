import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { logComplianceHistory } from "@/utils/compliance-history";

// LED-8: Compliance item detail page with status change actions + activity feed.
// Document attachments via LED-34 archive are wired separately (LED-40-style slot).

const JURISDICTION_LABELS: Record<string, string> = {
  NV: "Nevada",
  TN: "Tennessee",
  FED: "Federal",
  DAVIDSON_COUNTY: "Davidson County",
  CITY_OF_NASHVILLE: "City of Nashville",
};

const TYPE_LABELS: Record<string, string> = {
  annual_list: "Annual list",
  annual_report: "Annual report",
  registered_agent_renewal: "Registered agent renewal",
  member_meeting: "Member meeting",
  business_license: "Business license",
  sales_tax: "Sales tax filing",
  ffl_renewal: "FFL renewal",
  insurance_renewal: "Insurance renewal",
  other: "Other",
};

const CATEGORY_LABELS: Record<string, string> = {
  federal: "Federal",
  state: "State",
  local: "Local",
  tax: "Tax",
  insurance: "Insurance",
};

const EVENT_LABELS: Record<string, string> = {
  created: "Item created",
  status_changed: "Status changed",
  filed: "Marked as filed",
  completed: "Marked as done",
  reopened: "Re-opened",
  edited: "Edited",
  document_attached: "Document attached",
  document_removed: "Document removed",
  noted: "Note added",
};

function daysUntil(iso: string): number {
  const due = new Date(iso + "T00:00:00").getTime();
  const today = new Date(new Date().toDateString()).getTime();
  return Math.round((due - today) / 86_400_000);
}

function dueLabel(daysAway: number): { text: string; cls: string } {
  if (daysAway < 0)
    return {
      text: `${Math.abs(daysAway)} day${Math.abs(daysAway) === 1 ? "" : "s"} overdue`,
      cls: "text-red-300 font-medium",
    };
  if (daysAway === 0) return { text: "due today", cls: "text-orange-300" };
  if (daysAway <= 7)
    return { text: `due in ${daysAway} days`, cls: "text-orange-300" };
  if (daysAway <= 30)
    return { text: `due in ${daysAway} days`, cls: "text-amber-300" };
  return { text: `due in ${daysAway} days`, cls: "text-zinc-400" };
}

function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDollars(cents: number | null): string | null {
  if (cents === null || cents === undefined) return null;
  return `$${(cents / 100).toFixed(2)}`;
}

function formatCadence(interval: string | null): string {
  if (!interval) return "One-time";
  const labels: Record<string, string> = {
    "1 mon": "Monthly",
    "3 mons": "Quarterly",
    "1 year": "Annual",
    "2 years": "Every 2 years",
    "3 years": "Every 3 years",
  };
  return labels[interval] ?? interval;
}

// ── Server Actions ──────────────────────────────────────────────────────

async function markInProgress(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  const supabase = await createClient();
  const { error } = await supabase
    .from("compliance_items")
    .update({ status: "in_progress" })
    .eq("id", id);
  if (error) throw new Error(`Mark in progress failed: ${error.message}`);
  await logComplianceHistory({
    complianceItemId: id,
    eventType: "status_changed",
    details: { to: "in_progress" },
  });
  revalidatePath(`/compliance/${id}`);
  revalidatePath("/compliance");
}

async function markFiled(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  const today = new Date().toISOString().slice(0, 10);
  const supabase = await createClient();
  // Set last_filed_date — the schema trigger auto-recomputes next_due_date
  // from last_filed_date + cadence_interval. Status flips to 'done' too.
  const { error } = await supabase
    .from("compliance_items")
    .update({
      last_filed_date: today,
      status: "done",
      completed_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(`Mark filed failed: ${error.message}`);
  await logComplianceHistory({
    complianceItemId: id,
    eventType: "filed",
    details: { filed_date: today },
  });
  revalidatePath(`/compliance/${id}`);
  revalidatePath("/compliance");
}

async function markDone(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  const supabase = await createClient();
  const { error } = await supabase
    .from("compliance_items")
    .update({
      status: "done",
      completed_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(`Mark done failed: ${error.message}`);
  await logComplianceHistory({
    complianceItemId: id,
    eventType: "completed",
  });
  revalidatePath(`/compliance/${id}`);
  revalidatePath("/compliance");
}

async function reopen(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  const supabase = await createClient();
  const { error } = await supabase
    .from("compliance_items")
    .update({
      status: "pending",
      completed_at: null,
    })
    .eq("id", id);
  if (error) throw new Error(`Reopen failed: ${error.message}`);
  await logComplianceHistory({
    complianceItemId: id,
    eventType: "reopened",
  });
  revalidatePath(`/compliance/${id}`);
  revalidatePath("/compliance");
}

// ────────────────────────────────────────────────────────────────────────

type HistoryRow = {
  id: string;
  occurred_at: string;
  actor_email: string;
  event_type: string;
  details: Record<string, unknown> | null;
};

export default async function ComplianceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [itemResult, historyResult] = await Promise.all([
    supabase
      .from("compliance_items")
      .select(
        "id, title, category, jurisdiction, compliance_type, cadence_interval, last_filed_date, next_due_date, status, completed_at, cost_cents, notes, created_at, updated_at",
      )
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("compliance_item_history")
      .select("id, occurred_at, actor_email, event_type, details")
      .eq("compliance_item_id", id)
      .order("occurred_at", { ascending: false })
      .limit(50),
  ]);

  const { data: item, error } = itemResult;
  const history = (historyResult.data ?? []) as HistoryRow[];

  if (error) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <div className="rounded-md border border-red-900/50 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          Couldn&apos;t load item: {error.message}
        </div>
      </div>
    );
  }

  if (!item) notFound();

  const days = daysUntil(item.next_due_date);
  const due = dueLabel(days);
  const isDone = item.status === "done";

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <header className="mb-6">
        <Link
          href="/compliance"
          className="print:hidden text-xs text-zinc-500 hover:text-zinc-300"
        >
          ← Back to Compliance
        </Link>
        <div className="flex items-start justify-between gap-4 mt-2">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {item.title}
            </h1>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-xs text-zinc-300">
                {JURISDICTION_LABELS[item.jurisdiction] ?? item.jurisdiction}
              </span>
              <span className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-xs text-zinc-300">
                {TYPE_LABELS[item.compliance_type] ?? item.compliance_type}
              </span>
              <span className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-xs text-zinc-400">
                {CATEGORY_LABELS[item.category] ?? item.category}
              </span>
              <span className="text-xs uppercase tracking-wide text-zinc-500 ml-1">
                {item.status.replace("_", " ")}
              </span>
            </div>
          </div>
          <Link
            href={`/compliance/${item.id}/edit`}
            className="print:hidden shrink-0 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800"
          >
            Edit
          </Link>
        </div>
      </header>

      {/* Status action bar */}
      <div className="print:hidden flex flex-wrap items-center gap-2 mb-6">
        {!isDone && (
          <>
            {item.status === "pending" && (
              <form action={markInProgress}>
                <input type="hidden" name="id" value={item.id} />
                <button
                  type="submit"
                  className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800"
                >
                  Mark in progress
                </button>
              </form>
            )}
            <form action={markFiled}>
              <input type="hidden" name="id" value={item.id} />
              <button
                type="submit"
                className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-emerald-50 hover:bg-emerald-600"
                title="Sets last_filed_date to today; cadence trigger auto-recomputes next due date"
              >
                Mark filed (today)
              </button>
            </form>
            <form action={markDone}>
              <input type="hidden" name="id" value={item.id} />
              <button
                type="submit"
                className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800"
                title="Marks done without changing last_filed_date (e.g. for one-off completions)"
              >
                Mark done
              </button>
            </form>
          </>
        )}
        {isDone && (
          <form action={reopen}>
            <input type="hidden" name="id" value={item.id} />
            <button
              type="submit"
              className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800"
            >
              Re-open
            </button>
          </form>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs uppercase tracking-wide text-zinc-500">
            Next due
          </p>
          <p className="text-lg font-medium text-zinc-100 mt-1">
            {formatDate(item.next_due_date)}
          </p>
          <p className={`text-xs mt-1 ${due.cls}`}>{due.text}</p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs uppercase tracking-wide text-zinc-500">
            Cadence
          </p>
          <p className="text-lg font-medium text-zinc-100 mt-1">
            {formatCadence(item.cadence_interval)}
          </p>
          {item.last_filed_date && (
            <p className="text-xs text-zinc-500 mt-1">
              Last filed: {formatDate(item.last_filed_date)}
            </p>
          )}
        </div>
        {item.cost_cents !== null && item.cost_cents !== undefined && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              Cost
            </p>
            <p className="text-lg font-medium text-zinc-100 mt-1 tabular-nums">
              {formatDollars(item.cost_cents)}
            </p>
          </div>
        )}
      </div>

      {item.notes && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 mb-6">
          <p className="text-xs uppercase tracking-wide text-zinc-500 mb-2">
            Notes
          </p>
          <p className="text-sm text-zinc-200 whitespace-pre-wrap">
            {item.notes}
          </p>
        </div>
      )}

      {/* Activity feed */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 mb-6">
        <p className="text-xs uppercase tracking-wide text-zinc-500 mb-3">
          Activity
        </p>
        {history.length === 0 ? (
          <p className="text-sm text-zinc-600">
            No activity yet. Status changes will appear here.
          </p>
        ) : (
          <ul className="space-y-3">
            {history.map((h) => {
              const detail = h.details && Object.keys(h.details).length > 0
                ? Object.entries(h.details)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(", ")
                : null;
              return (
                <li key={h.id} className="flex items-start gap-3 text-sm">
                  <span className="text-xs text-zinc-500 tabular-nums w-32 shrink-0 mt-0.5">
                    {formatDateShort(h.occurred_at)} ·{" "}
                    {formatTime(h.occurred_at)}
                  </span>
                  <div className="flex-1">
                    <p className="text-zinc-200">
                      {EVENT_LABELS[h.event_type] ?? h.event_type}
                    </p>
                    {detail && (
                      <p className="text-xs text-zinc-500 mt-0.5">{detail}</p>
                    )}
                    <p className="text-xs text-zinc-600 mt-0.5">
                      {h.actor_email}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="text-xs text-zinc-600">
        Created {new Date(item.created_at).toLocaleDateString()} · Updated{" "}
        {new Date(item.updated_at).toLocaleDateString()}
      </p>
    </div>
  );
}
