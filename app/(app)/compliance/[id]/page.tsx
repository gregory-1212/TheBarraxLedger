import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

// LED-8 (minimal): read-only detail page. Full activity feed + status
// change buttons + document attachments + edit form come in the LED-8 follow-up
// + LED-7 edit path.

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

export default async function ComplianceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: item, error } = await supabase
    .from("compliance_items")
    .select(
      "id, title, category, jurisdiction, compliance_type, cadence_interval, last_filed_date, next_due_date, status, completed_at, cost_cents, notes, created_at, updated_at",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

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

      <p className="text-xs text-zinc-600">
        Created {new Date(item.created_at).toLocaleDateString()} · Updated{" "}
        {new Date(item.updated_at).toLocaleDateString()}
      </p>
    </div>
  );
}
