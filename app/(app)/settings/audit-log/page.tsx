import Link from "next/link";
import { createClient } from "@/utils/supabase/server";

// LED-56: Audit log viewer. Reads from audit_log via RLS-gated staff client.
// Filters: actor, action, entity_type, date range — all via URL params.

const ACTION_LABELS: Record<string, string> = {
  tin_reveal: "TIN revealed",
  document_download: "Document downloaded",
  document_delete: "Document deleted",
  csv_export: "CSV exported",
  year_end_packet_export: "Year-end packet exported",
  vendor_delete: "Vendor deleted",
  compliance_filed: "Compliance filed",
  form_1099_delivered: "1099 delivered to recipient",
};

const ENTITY_TYPE_LABELS: Record<string, string> = {
  vendor: "Vendor",
  bill: "Bill",
  compliance_item: "Compliance item",
  receipt: "Receipt",
  document: "Document",
  form_1099_delivery: "1099 delivery",
};

type AuditRow = {
  id: string;
  occurred_at: string;
  actor_id: string | null;
  actor_email: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
};

type Search = {
  actor?: string;
  action?: string;
  entity_type?: string;
  from?: string;
  to?: string;
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("audit_log")
    .select(
      "id, occurred_at, actor_id, actor_email, action, entity_type, entity_id, metadata, ip_address",
    )
    .order("occurred_at", { ascending: false })
    .limit(200);

  if (params.actor) {
    query = query.eq("actor_email", params.actor);
  }
  if (params.action) {
    query = query.eq("action", params.action);
  }
  if (params.entity_type) {
    query = query.eq("entity_type", params.entity_type);
  }
  if (params.from) {
    query = query.gte("occurred_at", params.from);
  }
  if (params.to) {
    // Include the whole "to" day by adding T23:59:59
    query = query.lte("occurred_at", `${params.to}T23:59:59.999Z`);
  }

  const { data, error } = await query;
  const rows = (data ?? []) as AuditRow[];

  // Distinct values for filter dropdowns (small queries, fine on each page load)
  const [actorsResult, actionsResult, entityTypesResult] = await Promise.all([
    supabase
      .from("audit_log")
      .select("actor_email")
      .order("actor_email", { ascending: true }),
    supabase
      .from("audit_log")
      .select("action")
      .order("action", { ascending: true }),
    supabase
      .from("audit_log")
      .select("entity_type")
      .not("entity_type", "is", null),
  ]);

  const uniqueActors = Array.from(
    new Set((actorsResult.data ?? []).map((r) => r.actor_email).filter(Boolean)),
  );
  const uniqueActions = Array.from(
    new Set((actionsResult.data ?? []).map((r) => r.action).filter(Boolean)),
  );
  const uniqueEntityTypes = Array.from(
    new Set(
      (entityTypesResult.data ?? [])
        .map((r) => r.entity_type)
        .filter((v): v is string => !!v),
    ),
  );

  const hasFilter = !!(
    params.actor ||
    params.action ||
    params.entity_type ||
    params.from ||
    params.to
  );

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <header className="mb-6">
        <Link
          href="/settings"
          className="print:hidden text-xs text-zinc-500 hover:text-zinc-300"
        >
          ← Back to Settings
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight mt-2">
          Audit log
        </h1>
        <p className="text-sm text-zinc-400 mt-1">
          Append-only record of every sensitive action. RLS-gated; nobody can
          edit or delete rows.
        </p>
      </header>

      {/* Filters */}
      <form
        action="/settings/audit-log"
        method="GET"
        className="print:hidden flex flex-wrap gap-2 mb-4 items-end"
      >
        <div>
          <label htmlFor="actor" className="block text-xs text-zinc-500 mb-1">
            Actor
          </label>
          <select
            id="actor"
            name="actor"
            defaultValue={params.actor ?? ""}
            className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200"
          >
            <option value="">All actors</option>
            {uniqueActors.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="action" className="block text-xs text-zinc-500 mb-1">
            Action
          </label>
          <select
            id="action"
            name="action"
            defaultValue={params.action ?? ""}
            className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200"
          >
            <option value="">All actions</option>
            {uniqueActions.map((a) => (
              <option key={a} value={a}>
                {ACTION_LABELS[a] ?? a}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="entity_type"
            className="block text-xs text-zinc-500 mb-1"
          >
            Entity
          </label>
          <select
            id="entity_type"
            name="entity_type"
            defaultValue={params.entity_type ?? ""}
            className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200"
          >
            <option value="">All entities</option>
            {uniqueEntityTypes.map((t) => (
              <option key={t} value={t}>
                {ENTITY_TYPE_LABELS[t] ?? t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="from" className="block text-xs text-zinc-500 mb-1">
            From
          </label>
          <input
            id="from"
            name="from"
            type="date"
            defaultValue={params.from ?? ""}
            className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200"
          />
        </div>
        <div>
          <label htmlFor="to" className="block text-xs text-zinc-500 mb-1">
            To
          </label>
          <input
            id="to"
            name="to"
            type="date"
            defaultValue={params.to ?? ""}
            className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200"
          />
        </div>
        <button
          type="submit"
          className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800"
        >
          Apply
        </button>
        {hasFilter && (
          <Link
            href="/settings/audit-log"
            className="rounded-md px-3 py-1.5 text-sm text-zinc-500 hover:text-zinc-300"
          >
            Clear
          </Link>
        )}
      </form>

      {error ? (
        <div className="rounded-md border border-red-900/50 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          Couldn&apos;t load audit log: {error.message}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-800 bg-zinc-950 px-6 py-12 text-center">
          <p className="text-sm text-zinc-400">
            {hasFilter
              ? "No audit events match these filters."
              : "No audit events yet."}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-zinc-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/50 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="text-left px-4 py-2 font-medium">When</th>
                <th className="text-left px-4 py-2 font-medium">Actor</th>
                <th className="text-left px-4 py-2 font-medium">Action</th>
                <th className="text-left px-4 py-2 font-medium">Entity</th>
                <th className="text-left px-4 py-2 font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {rows.map((r) => {
                const meta = r.metadata && Object.keys(r.metadata).length > 0
                  ? Object.entries(r.metadata)
                      .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
                      .join(", ")
                  : null;
                return (
                  <tr key={r.id}>
                    <td className="px-4 py-2.5 text-zinc-400 text-xs tabular-nums whitespace-nowrap">
                      {formatDateTime(r.occurred_at)}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-200 text-xs">
                      {r.actor_email}
                      {r.ip_address && (
                        <span className="block text-zinc-600">
                          {r.ip_address}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-200">
                      {ACTION_LABELS[r.action] ?? r.action}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-400 text-xs">
                      {r.entity_type
                        ? `${ENTITY_TYPE_LABELS[r.entity_type] ?? r.entity_type}`
                        : "—"}
                      {r.entity_id && (
                        <span className="block text-zinc-600 font-mono break-all">
                          {r.entity_id.slice(0, 8)}…
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-500 text-xs break-all">
                      {meta ?? ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-zinc-900/30 text-xs">
              <tr>
                <td colSpan={5} className="px-4 py-2 text-zinc-500">
                  Showing {rows.length}
                  {rows.length === 200 ? " (most recent 200 — narrow filters to see older)" : ""}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
