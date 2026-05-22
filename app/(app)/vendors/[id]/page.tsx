import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

// LED-15: vendor detail with YTD spend, recent bills, W-9 status actions.
// Activity feed + edit + tax ID reveal still deferred (separate tickets).

// ── Server Actions ──────────────────────────────────────────────────────

async function setVendorStatus(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  const status = String(formData.get("status"));

  if (!["active", "inactive", "hold", "archived"].includes(status)) {
    throw new Error("Invalid vendor status");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("vendors")
    .update({ status })
    .eq("id", id);
  if (error) throw new Error(`Vendor status update failed: ${error.message}`);

  revalidatePath(`/vendors/${id}`);
  revalidatePath("/vendors");
}

async function setW9Status(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  const status = String(formData.get("status"));

  if (!["missing", "requested", "received", "verified"].includes(status)) {
    throw new Error("Invalid W-9 status");
  }

  const update: Record<string, unknown> = { w9_status: status };
  const now = new Date().toISOString();
  if (status === "requested") update.w9_requested_at = now;
  if (status === "received") update.w9_received_at = now;
  if (status === "verified") update.w9_verified_at = now;
  if (status === "missing") {
    update.w9_requested_at = null;
    update.w9_received_at = null;
    update.w9_verified_at = null;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("vendors")
    .update(update)
    .eq("id", id);
  if (error) throw new Error(`W-9 status update failed: ${error.message}`);

  revalidatePath(`/vendors/${id}`);
  revalidatePath("/vendors");
}

// ────────────────────────────────────────────────────────────────────────


const VENDOR_TYPE_LABELS: Record<string, string> = {
  subscription: "Subscription",
  utility: "Utility",
  contractor: "Contractor",
  supplier: "Supplier",
  government: "Government",
  other: "Other",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  inactive: "Inactive",
  hold: "Hold",
  archived: "Archived",
};

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

function formatDateShort(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

type BillRow = {
  id: string;
  amount_cents: number;
  amount_paid_cents: number | null;
  due_date: string;
  paid_date: string | null;
  status: string;
  reference: string | null;
  expense_category: { name: string } | null;
};

export default async function VendorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // Year boundaries for YTD calculation
  const now = new Date();
  const yearStart = `${now.getFullYear()}-01-01`;
  const yearEnd = `${now.getFullYear()}-12-31`;

  const [vendorResult, billsResult, ytdResult] = await Promise.all([
    supabase
      .from("vendors")
      .select(
        "id, name, dba, vendor_type, contact_name, contact_email, contact_phone, billing_address, payment_method, default_expense_category, is_1099_eligible, business_classification, w9_status, status, notes, created_at, updated_at",
      )
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("bills")
      .select(
        "id, amount_cents, amount_paid_cents, due_date, paid_date, status, reference, expense_category:expense_categories(name)",
      )
      .eq("vendor_id", id)
      .is("deleted_at", null)
      .order("due_date", { ascending: false })
      .limit(10),
    supabase
      .from("bills")
      .select("amount_paid_cents")
      .eq("vendor_id", id)
      .is("deleted_at", null)
      .not("paid_date", "is", null)
      .gte("paid_date", yearStart)
      .lte("paid_date", yearEnd),
  ]);

  const { data: vendor, error } = vendorResult;
  const bills = (billsResult.data as unknown as BillRow[] | null) ?? [];
  const ytdRows = (ytdResult.data ?? []) as { amount_paid_cents: number | null }[];
  const ytdTotal = ytdRows.reduce(
    (acc, r) => acc + (r.amount_paid_cents ?? 0),
    0,
  );

  if (error) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <div className="rounded-md border border-red-900/50 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          Couldn&apos;t load vendor: {error.message}
        </div>
      </div>
    );
  }

  if (!vendor) notFound();

  // LED-44: Backup withholding advisory. Triggered when a 1099-eligible vendor
  // has NOT produced a W-9 AND we've already paid them >= $2,000 YTD (the
  // 2026 IRS backup-withholding threshold). Advisory only — we do not
  // automate the 24% withhold itself.
  const BACKUP_WITHHOLDING_CENTS = 200000; // $2,000
  const W9_OK = vendor.w9_status === "received" || vendor.w9_status === "verified";
  const requiresBackupWithholding =
    vendor.is_1099_eligible && !W9_OK && ytdTotal >= BACKUP_WITHHOLDING_CENTS;
  // Soft warning at $1,500 — give Greg/Julie a heads-up before crossing.
  const approachingBackupWithholding =
    vendor.is_1099_eligible &&
    !W9_OK &&
    ytdTotal >= 150000 &&
    ytdTotal < BACKUP_WITHHOLDING_CENTS;

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <header className="mb-6">
        <Link
          href="/vendors"
          className="print:hidden text-xs text-zinc-500 hover:text-zinc-300"
        >
          ← Back to Vendors
        </Link>
        <div className="flex items-start justify-between gap-4 mt-2">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {vendor.name}
            </h1>
            {vendor.dba && (
              <p className="text-sm text-zinc-500 mt-1">dba {vendor.dba}</p>
            )}
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <span className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-xs text-zinc-300">
                {VENDOR_TYPE_LABELS[vendor.vendor_type] ?? vendor.vendor_type}
              </span>
              <span className="text-xs uppercase tracking-wide text-zinc-500">
                {STATUS_LABELS[vendor.status] ?? vendor.status}
              </span>
              {vendor.is_1099_eligible && (
                <span
                  className={`rounded-md border px-2 py-0.5 text-xs ${W9_STATUS_CLASSES[vendor.w9_status]}`}
                >
                  W-9: {W9_STATUS_LABELS[vendor.w9_status] ?? vendor.w9_status}
                </span>
              )}
            </div>
          </div>
          <Link
            href={`/vendors/${vendor.id}/edit`}
            className="print:hidden shrink-0 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800"
          >
            Edit
          </Link>
        </div>
      </header>

      {/* LED-44 Backup-withholding banners */}
      {requiresBackupWithholding && (
        <div className="rounded-md border border-red-900/60 bg-red-950/40 px-4 py-3 mb-6">
          <p className="text-sm text-red-100 font-medium">
            ⚠ Backup withholding required
          </p>
          <p className="text-xs text-red-200/90 mt-1">
            This 1099-eligible vendor has been paid {formatDollars(ytdTotal)}{" "}
            YTD with no W-9 on file. Per 2026 IRS rules, payments at or above
            $2,000 to a non-W-9 contractor trigger mandatory 24% backup
            withholding. <strong>Do not pay further</strong> until the W-9
            lands. Mark W-9 received below once you have it.
          </p>
        </div>
      )}
      {approachingBackupWithholding && (
        <div className="rounded-md border border-amber-900/60 bg-amber-950/30 px-4 py-3 mb-6">
          <p className="text-sm text-amber-100">
            Approaching backup-withholding threshold
          </p>
          <p className="text-xs text-amber-200/90 mt-1">
            Paid {formatDollars(ytdTotal)} YTD, no W-9 on file. At $2,000 in
            cumulative payments the IRS requires 24% withholding. Get the W-9
            now to avoid disrupting future payments.
          </p>
        </div>
      )}

      {/* YTD + Recent Bills */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs uppercase tracking-wide text-zinc-500">
            YTD spend ({now.getFullYear()})
          </p>
          <p className="text-2xl font-semibold text-zinc-100 mt-1 tabular-nums">
            {formatDollars(ytdTotal)}
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            {ytdRows.length} paid bill{ytdRows.length === 1 ? "" : "s"} this year
          </p>
        </div>
        <div className="md:col-span-2 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs uppercase tracking-wide text-zinc-500 mb-2">
            Recent bills
          </p>
          {bills.length === 0 ? (
            <p className="text-sm text-zinc-600">No bills yet.</p>
          ) : (
            <ul className="divide-y divide-zinc-800 -my-2">
              {bills.map((b) => {
                const paid = !!b.paid_date;
                return (
                  <li key={b.id} className="py-2">
                    <Link
                      href={`/bills/${b.id}`}
                      className="flex items-baseline justify-between gap-3 text-sm hover:bg-zinc-800/40 -mx-2 px-2 py-1 rounded transition-colors"
                    >
                      <span className="text-zinc-200 truncate">
                        {b.expense_category?.name ?? "Uncategorized"}
                        {b.reference && (
                          <span className="text-zinc-500 text-xs ml-2">
                            {b.reference}
                          </span>
                        )}
                      </span>
                      <span className="flex items-baseline gap-3 shrink-0">
                        <span
                          className={
                            "text-xs tabular-nums " +
                            (paid ? "text-zinc-500" : "text-zinc-400")
                          }
                        >
                          {paid && b.paid_date
                            ? `paid ${formatDateShort(b.paid_date)}`
                            : `due ${formatDateShort(b.due_date)}`}
                        </span>
                        <span className="text-zinc-100 tabular-nums w-20 text-right">
                          {formatDollars(b.amount_cents)}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <div className="space-y-4 mb-6">
        {(vendor.contact_name ||
          vendor.contact_email ||
          vendor.contact_phone ||
          vendor.billing_address) && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500 mb-2">
              Contact
            </p>
            <dl className="space-y-1 text-sm">
              {vendor.contact_name && (
                <div className="flex gap-2">
                  <dt className="text-zinc-500 w-16 shrink-0">Name</dt>
                  <dd className="text-zinc-200">{vendor.contact_name}</dd>
                </div>
              )}
              {vendor.contact_email && (
                <div className="flex gap-2">
                  <dt className="text-zinc-500 w-16 shrink-0">Email</dt>
                  <dd className="text-zinc-200">
                    <a
                      href={`mailto:${vendor.contact_email}`}
                      className="hover:underline"
                    >
                      {vendor.contact_email}
                    </a>
                  </dd>
                </div>
              )}
              {vendor.contact_phone && (
                <div className="flex gap-2">
                  <dt className="text-zinc-500 w-16 shrink-0">Phone</dt>
                  <dd className="text-zinc-200">{vendor.contact_phone}</dd>
                </div>
              )}
              {vendor.billing_address && (
                <div className="flex gap-2">
                  <dt className="text-zinc-500 w-16 shrink-0">Address</dt>
                  <dd className="text-zinc-200 whitespace-pre-wrap">
                    {vendor.billing_address}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        )}

        {(vendor.payment_method || vendor.default_expense_category) && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500 mb-2">
              Payment defaults
            </p>
            <dl className="space-y-1 text-sm">
              {vendor.payment_method && (
                <div className="flex gap-2">
                  <dt className="text-zinc-500 w-32 shrink-0">Method</dt>
                  <dd className="text-zinc-200">{vendor.payment_method}</dd>
                </div>
              )}
              {vendor.default_expense_category && (
                <div className="flex gap-2">
                  <dt className="text-zinc-500 w-32 shrink-0">Category</dt>
                  <dd className="text-zinc-200">
                    {vendor.default_expense_category}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        )}

        {vendor.is_1099_eligible && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500 mb-2">
              1099 / tax
            </p>
            <dl className="space-y-1 text-sm">
              {vendor.business_classification && (
                <div className="flex gap-2">
                  <dt className="text-zinc-500 w-32 shrink-0">Classification</dt>
                  <dd className="text-zinc-200">
                    {BUSINESS_CLASSIFICATION_LABELS[
                      vendor.business_classification
                    ] ?? vendor.business_classification}
                  </dd>
                </div>
              )}
              <div className="flex gap-2 items-center">
                <dt className="text-zinc-500 w-32 shrink-0">W-9 status</dt>
                <dd>
                  <span
                    className={`inline-block rounded-md border px-2 py-0.5 text-xs ${W9_STATUS_CLASSES[vendor.w9_status]}`}
                  >
                    {W9_STATUS_LABELS[vendor.w9_status] ?? vendor.w9_status}
                  </span>
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-zinc-500 w-32 shrink-0">Tax ID</dt>
                <dd className="text-zinc-500 italic">
                  Reveal flow ships with LED-38
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-zinc-500 w-32 shrink-0">W-9 file</dt>
                <dd className="text-zinc-500 italic">
                  Upload ships with LED-40
                </dd>
              </div>
            </dl>

            {/* W-9 status action bar (LED-43) */}
            <div className="print:hidden flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-zinc-800">
              {vendor.w9_status === "missing" && (
                <>
                  <form action={setW9Status}>
                    <input type="hidden" name="id" value={vendor.id} />
                    <input type="hidden" name="status" value="requested" />
                    <button
                      type="submit"
                      className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800"
                    >
                      Mark W-9 requested
                    </button>
                  </form>
                  <form action={setW9Status}>
                    <input type="hidden" name="id" value={vendor.id} />
                    <input type="hidden" name="status" value="received" />
                    <button
                      type="submit"
                      className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-emerald-50 hover:bg-emerald-600"
                    >
                      Mark W-9 received
                    </button>
                  </form>
                </>
              )}
              {vendor.w9_status === "requested" && (
                <>
                  <form action={setW9Status}>
                    <input type="hidden" name="id" value={vendor.id} />
                    <input type="hidden" name="status" value="received" />
                    <button
                      type="submit"
                      className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-emerald-50 hover:bg-emerald-600"
                    >
                      Mark W-9 received
                    </button>
                  </form>
                  <form action={setW9Status}>
                    <input type="hidden" name="id" value={vendor.id} />
                    <input type="hidden" name="status" value="missing" />
                    <button
                      type="submit"
                      className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
                    >
                      Reset to missing
                    </button>
                  </form>
                </>
              )}
              {vendor.w9_status === "received" && (
                <form action={setW9Status}>
                  <input type="hidden" name="id" value={vendor.id} />
                  <input type="hidden" name="status" value="missing" />
                  <button
                    type="submit"
                    className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
                  >
                    Reset W-9 (rare)
                  </button>
                </form>
              )}
              {vendor.w9_status === "verified" && (
                <p className="text-xs text-zinc-500">
                  TIN verified against IRS. No further action needed.
                </p>
              )}
            </div>
          </div>
        )}

        {vendor.notes && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500 mb-2">
              Notes
            </p>
            <p className="text-sm text-zinc-200 whitespace-pre-wrap">
              {vendor.notes}
            </p>
          </div>
        )}
      </div>

      {/* LED-39 Vendor status actions */}
      <div className="print:hidden rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 mb-6">
        <p className="text-xs uppercase tracking-wide text-zinc-500 mb-2">
          Vendor status
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {vendor.status === "active" && (
            <>
              <form action={setVendorStatus}>
                <input type="hidden" name="id" value={vendor.id} />
                <input type="hidden" name="status" value="hold" />
                <button
                  type="submit"
                  className="rounded-md border border-amber-900/60 bg-amber-950/30 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-950/50"
                  title="Pauses without losing history. Use when a vendor relationship is on hold."
                >
                  Place on hold
                </button>
              </form>
              <form action={setVendorStatus}>
                <input type="hidden" name="id" value={vendor.id} />
                <input type="hidden" name="status" value="inactive" />
                <button
                  type="submit"
                  className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
                  title="Hides from default views but keeps history. Use when relationship ended."
                >
                  Mark inactive
                </button>
              </form>
              <form action={setVendorStatus}>
                <input type="hidden" name="id" value={vendor.id} />
                <input type="hidden" name="status" value="archived" />
                <button
                  type="submit"
                  className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
                  title="Permanently archive. Old bills still resolve the vendor name."
                >
                  Archive
                </button>
              </form>
            </>
          )}
          {vendor.status === "hold" && (
            <>
              <p className="text-xs text-amber-200">
                Currently on hold — payments paused.
              </p>
              <form action={setVendorStatus}>
                <input type="hidden" name="id" value={vendor.id} />
                <input type="hidden" name="status" value="active" />
                <button
                  type="submit"
                  className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-emerald-50 hover:bg-emerald-600"
                >
                  Reactivate
                </button>
              </form>
            </>
          )}
          {vendor.status === "inactive" && (
            <>
              <p className="text-xs text-zinc-500">
                Inactive — hidden from default views.
              </p>
              <form action={setVendorStatus}>
                <input type="hidden" name="id" value={vendor.id} />
                <input type="hidden" name="status" value="active" />
                <button
                  type="submit"
                  className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-emerald-50 hover:bg-emerald-600"
                >
                  Reactivate
                </button>
              </form>
            </>
          )}
          {vendor.status === "archived" && (
            <>
              <p className="text-xs text-zinc-500">Archived.</p>
              <form action={setVendorStatus}>
                <input type="hidden" name="id" value={vendor.id} />
                <input type="hidden" name="status" value="active" />
                <button
                  type="submit"
                  className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
                >
                  Restore to active
                </button>
              </form>
            </>
          )}
        </div>
      </div>

      <p className="text-xs text-zinc-600">
        Created {new Date(vendor.created_at).toLocaleDateString()} · Updated{" "}
        {new Date(vendor.updated_at).toLocaleDateString()}
      </p>
    </div>
  );
}
