import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

// LED-15 (minimal): read-only vendor detail. Activity feed + edit + 1099
// details (tax ID reveal, W-9 upload) deferred until LED-15 proper + LED-38/40.

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

export default async function VendorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: vendor, error } = await supabase
    .from("vendors")
    .select(
      "id, name, dba, vendor_type, contact_name, contact_email, contact_phone, billing_address, payment_method, default_expense_category, is_1099_eligible, business_classification, w9_status, status, notes, created_at, updated_at",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

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

      <p className="text-xs text-zinc-600">
        Created {new Date(vendor.created_at).toLocaleDateString()} · Updated{" "}
        {new Date(vendor.updated_at).toLocaleDateString()}
      </p>
    </div>
  );
}
