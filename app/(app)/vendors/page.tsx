import Link from "next/link";
import { createClient } from "@/utils/supabase/server";

// LED-14: Vendors index — grouped by vendor_type.
// LED-41: "1099 Readiness" tab — filter to 1099-eligible vendors + W-9-status sort.

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

const W9_SORT_ORDER: Record<string, number> = {
  missing: 0,
  requested: 1,
  received: 2,
  verified: 3,
};

const BUSINESS_CLASSIFICATION_LABELS: Record<string, string> = {
  individual: "Individual / Sole Prop",
  sole_proprietorship: "Sole Proprietorship",
  partnership: "Partnership",
  llc: "LLC",
  c_corporation: "C Corporation",
  s_corporation: "S Corporation",
  tax_exempt: "Tax-exempt",
  other: "Other",
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
  business_classification: string | null;
};

const TABS = [
  { id: "all", label: "All Vendors" },
  { id: "1099", label: "1099 Readiness" },
] as const;
type TabId = (typeof TABS)[number]["id"];

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default async function VendorsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: TabId; show_inactive?: string }>;
}) {
  const params = await searchParams;
  const tab: TabId = params.tab === "1099" ? "1099" : "all";
  const showInactive = params.show_inactive === "1";

  const supabase = await createClient();

  let query = supabase
    .from("vendors")
    .select(
      "id, name, dba, vendor_type, is_1099_eligible, w9_status, status, business_classification",
    )
    .is("deleted_at", null);

  if (!showInactive) {
    query = query.eq("status", "active");
  }
  if (tab === "1099") {
    query = query.eq("is_1099_eligible", true);
  }

  query = query.order("name", { ascending: true });

  const { data, error } = await query;
  const vendors: Vendor[] = (data ?? []) as Vendor[];

  // YTD spend per vendor (only on 1099 tab — query is heavier so skip for default)
  let ytdByVendor = new Map<string, number>();
  if (tab === "1099" && vendors.length > 0) {
    const now = new Date();
    const yearStart = `${now.getFullYear()}-01-01`;
    const yearEnd = `${now.getFullYear()}-12-31`;
    const { data: billsData } = await supabase
      .from("bills")
      .select("vendor_id, amount_paid_cents")
      .in("vendor_id", vendors.map((v) => v.id))
      .is("deleted_at", null)
      .not("paid_date", "is", null)
      .gte("paid_date", yearStart)
      .lte("paid_date", yearEnd);
    for (const b of (billsData ?? []) as Array<{ vendor_id: string; amount_paid_cents: number | null }>) {
      const acc = ytdByVendor.get(b.vendor_id) ?? 0;
      ytdByVendor.set(b.vendor_id, acc + (b.amount_paid_cents ?? 0));
    }
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

      {/* Tabs */}
      <div className="print:hidden flex items-center gap-1 mb-4 border-b border-zinc-800">
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <Link
              key={t.id}
              href={t.id === "all" ? "/vendors" : `/vendors?tab=${t.id}`}
              className={
                "px-3 py-2 text-sm border-b-2 transition-colors -mb-px " +
                (active
                  ? "border-zinc-100 text-zinc-100"
                  : "border-transparent text-zinc-400 hover:text-zinc-200")
              }
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {/* Optional inactive toggle on default tab */}
      {tab === "all" && (
        <div className="print:hidden flex items-center gap-3 mb-6 text-xs">
          <Link
            href={
              showInactive
                ? "/vendors"
                : "/vendors?show_inactive=1"
            }
            className="text-zinc-500 hover:text-zinc-300"
          >
            {showInactive ? "Hide inactive/archived" : "Show inactive/archived"}
          </Link>
        </div>
      )}

      {error ? (
        <div className="rounded-md border border-red-900/50 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          Couldn&apos;t load vendors: {error.message}
        </div>
      ) : tab === "1099" ? (
        <Tab1099View vendors={vendors} ytdByVendor={ytdByVendor} />
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
        <TabAllView vendors={vendors} />
      )}
    </div>
  );
}

function TabAllView({ vendors }: { vendors: Vendor[] }) {
  const byType = new Map<string, Vendor[]>();
  for (const v of vendors) {
    const arr = byType.get(v.vendor_type) ?? [];
    arr.push(v);
    byType.set(v.vendor_type, arr);
  }
  return (
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
                    <th className="text-left px-4 py-2 font-medium">Name</th>
                    <th className="text-left px-4 py-2 font-medium">Status</th>
                    <th className="text-left px-4 py-2 font-medium">W-9</th>
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
  );
}

function Tab1099View({
  vendors,
  ytdByVendor,
}: {
  vendors: Vendor[];
  ytdByVendor: Map<string, number>;
}) {
  if (vendors.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-800 bg-zinc-950 px-6 py-12 text-center">
        <p className="text-sm text-zinc-400">
          No 1099-eligible vendors yet. Mark a vendor as 1099-eligible on its
          detail page.
        </p>
      </div>
    );
  }

  // Sort: W-9 status (missing → verified), then by name
  const sorted = [...vendors].sort((a, b) => {
    const wa = W9_SORT_ORDER[a.w9_status] ?? 99;
    const wb = W9_SORT_ORDER[b.w9_status] ?? 99;
    if (wa !== wb) return wa - wb;
    return a.name.localeCompare(b.name);
  });

  const total = sorted.length;
  const needW9 = sorted.filter((v) => v.w9_status === "missing").length;

  return (
    <>
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 mb-4">
        <p className="text-sm">
          <span className="text-zinc-100 font-medium">
            {needW9} of {total}
          </span>{" "}
          <span className="text-zinc-400">
            contractors still need a W-9 on file
          </span>
        </p>
        {needW9 > 0 && (
          <p className="text-xs text-zinc-500 mt-1">
            Year-end 1099-NEC filing requires a W-9 from every contractor paid
            ≥ $600.
          </p>
        )}
      </div>

      <div className="rounded-lg border border-zinc-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/50 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Name</th>
              <th className="text-left px-4 py-2 font-medium">Classification</th>
              <th className="text-left px-4 py-2 font-medium">W-9 Status</th>
              <th className="text-right px-4 py-2 font-medium">YTD Spend</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {sorted.map((v) => {
              const ytd = ytdByVendor.get(v.id) ?? 0;
              const W9_OK =
                v.w9_status === "received" || v.w9_status === "verified";
              // 1099-NEC issuance threshold (still $600 in 2026)
              const overIssuance = ytd >= 60000;
              // Backup withholding threshold (raised to $2,000 in 2026)
              const overBackupWithholding = ytd >= 200000;
              return (
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
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {v.business_classification
                      ? BUSINESS_CLASSIFICATION_LABELS[
                          v.business_classification
                        ] ?? v.business_classification
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-md border px-2 py-0.5 text-xs ${W9_STATUS_CLASSES[v.w9_status]}`}
                    >
                      {W9_STATUS_LABELS[v.w9_status] ?? v.w9_status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-100 tabular-nums">
                    {formatDollars(ytd)}
                    {!W9_OK && overBackupWithholding && (
                      <span className="block text-xs text-red-300 font-medium">
                        ⚠ Backup withholding required
                      </span>
                    )}
                    {!W9_OK && overIssuance && !overBackupWithholding && (
                      <span className="block text-xs text-amber-400">
                        ≥ $600, W-9 needed for 1099
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
