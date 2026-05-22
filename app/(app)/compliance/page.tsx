import { Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { ComplianceScorecard } from "@/components/ComplianceScorecard";

// LED-6: Compliance index page with filters.
// Filter row: jurisdiction / type / status (all via URL params, shareable links).
// Default sort: next_due_date asc. Overdue rows tinted; ≤30d amber; ≤14d orange.

type Search = {
  jurisdiction?: string;
  type?: string;
  status?: string;
};

const JURISDICTIONS = [
  { value: "", label: "All jurisdictions" },
  { value: "NV", label: "Nevada" },
  { value: "TN", label: "Tennessee" },
  { value: "FED", label: "Federal" },
  { value: "DAVIDSON_COUNTY", label: "Davidson Co." },
  { value: "CITY_OF_NASHVILLE", label: "Nashville" },
];

const TYPES = [
  { value: "", label: "All types" },
  { value: "annual_list", label: "Annual list" },
  { value: "annual_report", label: "Annual report" },
  { value: "registered_agent_renewal", label: "Registered agent" },
  { value: "member_meeting", label: "Member meeting" },
  { value: "business_license", label: "Business license" },
  { value: "sales_tax", label: "Sales tax" },
  { value: "ffl_renewal", label: "FFL renewal" },
  { value: "insurance_renewal", label: "Insurance" },
  { value: "other", label: "Other" },
];

const STATUSES = [
  { value: "", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
];

function jurisdictionLabel(value: string): string {
  return JURISDICTIONS.find((j) => j.value === value)?.label ?? value;
}

function typeLabel(value: string): string {
  return TYPES.find((t) => t.value === value)?.label ?? value;
}

function daysUntil(iso: string): number {
  const due = new Date(iso + "T00:00:00").getTime();
  const today = new Date(new Date().toDateString()).getTime();
  return Math.round((due - today) / 86_400_000);
}

// LED-36 severity ramp lite — full version comes when that issue ships.
function rowClasses(daysAway: number): string {
  if (daysAway < 0) return "bg-red-950/30 hover:bg-red-950/40";
  if (daysAway <= 14) return "bg-amber-950/20 hover:bg-amber-950/30";
  return "hover:bg-zinc-900";
}

function dueClasses(daysAway: number): string {
  if (daysAway < 0) return "text-red-300 font-medium";
  if (daysAway <= 7) return "text-orange-300";
  if (daysAway <= 14) return "text-amber-300";
  return "text-zinc-400";
}

function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function CompliancePage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("compliance_items")
    .select("id, title, jurisdiction, compliance_type, next_due_date, status")
    .is("deleted_at", null)
    .order("next_due_date", { ascending: true });

  if (params.jurisdiction) {
    query = query.eq("jurisdiction", params.jurisdiction);
  }
  if (params.type) {
    query = query.eq("compliance_type", params.type);
  }
  if (params.status) {
    query = query.eq("status", params.status);
  }

  const { data, error } = await query;

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Compliance</h1>
          <p className="text-sm text-zinc-400 mt-1">
            LLC filings (NV + TN), business licenses, member meetings, and
            deadlines.
          </p>
        </div>
        <Link
          href="/compliance/new"
          className="rounded-md bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-white transition-colors"
        >
          Add Compliance Item
        </Link>
      </header>

      {/* Scorecard */}
      <div className="mb-6">
        <Suspense fallback={null}>
          <ComplianceScorecard variant="full" />
        </Suspense>
      </div>

      {/* Filters */}
      <form
        method="GET"
        className="flex flex-wrap gap-2 mb-4"
        action="/compliance"
      >
        <select
          name="jurisdiction"
          defaultValue={params.jurisdiction ?? ""}
          className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200"
        >
          {JURISDICTIONS.map((j) => (
            <option key={j.value} value={j.value}>
              {j.label}
            </option>
          ))}
        </select>
        <select
          name="type"
          defaultValue={params.type ?? ""}
          className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200"
        >
          {TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={params.status ?? ""}
          className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200"
        >
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800"
        >
          Apply
        </button>
        {(params.jurisdiction || params.type || params.status) && (
          <Link
            href="/compliance"
            className="rounded-md px-3 py-1.5 text-sm text-zinc-500 hover:text-zinc-300"
          >
            Clear
          </Link>
        )}
      </form>

      {/* Table */}
      {error ? (
        <div className="rounded-md border border-red-900/50 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          Couldn&apos;t load items: {error.message}
        </div>
      ) : !data || data.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-800 bg-zinc-950 px-6 py-12 text-center">
          <p className="text-sm text-zinc-400">
            {params.jurisdiction || params.type || params.status
              ? "No items match these filters."
              : "No compliance items yet."}
          </p>
          {!(params.jurisdiction || params.type || params.status) && (
            <Link
              href="/compliance/new"
              className="inline-block mt-3 text-sm text-zinc-200 hover:text-white underline"
            >
              Add the first one
            </Link>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-zinc-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/50 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Title</th>
                <th className="text-left px-4 py-2 font-medium">Jurisdiction</th>
                <th className="text-left px-4 py-2 font-medium">Type</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
                <th className="text-right px-4 py-2 font-medium">Due</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {data.map((item) => {
                const days = daysUntil(item.next_due_date);
                return (
                  <tr
                    key={item.id}
                    className={`${rowClasses(days)} transition-colors`}
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/compliance/${item.id}`}
                        className="text-zinc-100 hover:underline"
                      >
                        {item.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-zinc-400">
                      {jurisdictionLabel(item.jurisdiction)}
                    </td>
                    <td className="px-4 py-3 text-zinc-400">
                      {typeLabel(item.compliance_type)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs uppercase tracking-wide text-zinc-400">
                        {item.status.replace("_", " ")}
                      </span>
                    </td>
                    <td
                      className={`px-4 py-3 text-right tabular-nums ${dueClasses(days)}`}
                    >
                      {formatDate(item.next_due_date)}
                      <span className="block text-xs text-zinc-500">
                        {days < 0
                          ? `${Math.abs(days)}d overdue`
                          : days === 0
                            ? "today"
                            : `in ${days}d`}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
