import Link from "next/link";
import { createClient } from "@/utils/supabase/server";

// LED-14: Vendors index — grouped by vendor_type with W-9 status visibility.
// LED-41 will add a "1099 Readiness" tab + YTD spend column later.

const VENDOR_TYPE_LABELS: Record<string, string> = {
  subscription: "Subscriptions",
  utility: "Utilities",
  contractor: "Contractors (1099)",
  supplier: "Suppliers",
  government: "Government",
  other: "Other",
};

const VENDOR_TYPE_ORDER = [
  "subscription",
  "utility",
  "contractor",
  "supplier",
  "government",
  "other",
];

const W9_STATUS_LABELS: Record<string, string> = {
  missing: "Missing",
  requested: "Requested",
  received: "Received",
  verified: "Verified",
};

const W9_STATUS_CLASSES: Record<string, string> = {
  missing: "bg-red-950/40 text-red-300 border-red-900/50",
  requested: "bg-amber-950/30 text-amber-300 border-amber-900/40",
  received: "bg-sky-950/30 text-sky-300 border-sky-900/40",
  verified: "bg-emerald-950/30 text-emerald-300 border-emerald-900/40",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  inactive: "Inactive",
  hold: "Hold",
  archived: "Archived",
};

type Vendor = {
  id: string;
  name: string;
  dba: string | null;
  vendor_type: string;
  is_1099_eligible: boolean;
  w9_status: string;
  status: string;
};

export default async function VendorsPage({
  searchParams,
}: {
  searchParams: Promise<{ show_inactive?: string }>;
}) {
  const params = await searchParams;
  const showInactive = params.show_inactive === "1";

  const supabase = await createClient();
  let query = supabase
    .from("vendors")
    .select("id, name, dba, vendor_type, is_1099_eligible, w9_status, status")
    .is("deleted_at", null)
    .order("name", { ascending: true });

  if (!showInactive) {
    query = query.eq("status", "active");
  }

  const { data, error } = await query;
  const vendors: Vendor[] = (data ?? []) as Vendor[];

  // Group by vendor_type
  const byType = new Map<string, Vendor[]>();
  for (const v of vendors) {
    const arr = byType.get(v.vendor_type) ?? [];
    arr.push(v);
    byType.set(v.vendor_type, arr);
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Vendors</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Subscriptions, utilities, contractors, suppliers — everyone money
            goes to.
          </p>
        </div>
        <Link
          href="/vendors/new"
          className="print:hidden rounded-md bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-white transition-colors"
        >
          Add Vendor
        </Link>
      </header>

      {/* Filter toggle */}
      <div className="print:hidden flex items-center gap-3 mb-6 text-xs">
        <Link
          href={showInactive ? "/vendors" : "/vendors?show_inactive=1"}
          className="text-zinc-500 hover:text-zinc-300"
        >
          {showInactive ? "Hide inactive/archived" : "Show inactive/archived"}
        </Link>
      </div>

      {error ? (
        <div className="rounded-md border border-red-900/50 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          Couldn&apos;t load vendors: {error.message}
        </div>
      ) : vendors.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-800 bg-zinc-950 px-6 py-12 text-center">
          <p className="text-sm text-zinc-400">No vendors yet.</p>
          <Link
            href="/vendors/new"
            className="inline-block mt-3 text-sm text-zinc-200 hover:text-white underline"
          >
            Add the first one
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          {VENDOR_TYPE_ORDER.filter((t) => byType.has(t)).map((type) => {
            const vendorsOfType = byType.get(type)!;
            return (
              <section key={type}>
                <h2 className="text-xs uppercase tracking-wide text-zinc-500 font-medium mb-2 px-1">
                  {VENDOR_TYPE_LABELS[type] ?? type} · {vendorsOfType.length}
                </h2>
                <div className="rounded-lg border border-zinc-800 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-zinc-900/50 text-xs uppercase tracking-wide text-zinc-500">
                      <tr>
                        <th className="text-left px-4 py-2 font-medium">
                          Name
                        </th>
                        <th className="text-left px-4 py-2 font-medium">
                          Status
                        </th>
                        <th className="text-left px-4 py-2 font-medium">
                          W-9
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800">
                      {vendorsOfType.map((v) => (
                        <tr
                          key={v.id}
                          className="hover:bg-zinc-900 transition-colors"
                        >
                          <td className="px-4 py-3">
                            <Link
                              href={`/vendors/${v.id}`}
                              className="text-zinc-100 hover:underline"
                            >
                              {v.name}
                            </Link>
                            {v.dba && (
                              <span className="ml-2 text-xs text-zinc-500">
                                dba {v.dba}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs text-zinc-400">
                              {STATUS_LABELS[v.status] ?? v.status}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {v.is_1099_eligible ? (
                              <span
                                className={`inline-block rounded-md border px-2 py-0.5 text-xs ${W9_STATUS_CLASSES[v.w9_status]}`}
                              >
                                {W9_STATUS_LABELS[v.w9_status] ?? v.w9_status}
                              </span>
                            ) : (
                              <span className="text-xs text-zinc-600">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
