import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import {
  uploadDocument,
  softDeleteDocument,
  listDocumentsForEntity,
  type DocumentRow,
} from "@/utils/documents";
import { logAudit, AUDIT_ACTIONS } from "@/utils/audit-log";
import { RevealTin } from "@/components/RevealTin";
import {
  encryptTaxId,
  decryptTaxId,
  maskTaxId,
  normalizeTaxId,
  isValidTaxId,
} from "@/utils/tax-id";
import { tinTypeForClassification } from "@/utils/iris-1099-nec";

// LED-15: vendor detail with YTD spend, recent bills, W-9 status actions.
// LED-40: named document slots (W-9 / Contract / COI) + Other section.
// Activity feed + tax ID reveal still deferred (separate tickets).

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

// LED-40 server actions ─────────────────────────────────────────────────

const VENDOR_DOC_TAGS = ["w9", "contract", "coi", "other"] as const;
type VendorDocTag = (typeof VENDOR_DOC_TAGS)[number];

async function uploadVendorDocument(formData: FormData) {
  "use server";
  const vendorId = String(formData.get("vendor_id"));
  const tagRaw = String(formData.get("tag") ?? "other");
  const tag: VendorDocTag = (VENDOR_DOC_TAGS as readonly string[]).includes(
    tagRaw,
  )
    ? (tagRaw as VendorDocTag)
    : "other";
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("No file uploaded");
  }
  // Conservative max — 20 MB. Most W-9/Contract/COI PDFs are < 1 MB.
  // Storing huge files inflates costs; bigger ones should be split or rehosted.
  const MAX_BYTES = 20 * 1024 * 1024;
  if (file.size > MAX_BYTES) {
    throw new Error(`File too large (max ${MAX_BYTES / 1024 / 1024} MB)`);
  }

  await uploadDocument({
    body: file,
    filename: file.name,
    mimeType: file.type || "application/octet-stream",
    sizeBytes: file.size,
    entityType: "vendor",
    entityId: vendorId,
    tags: [tag],
  });

  revalidatePath(`/vendors/${vendorId}`);
}

async function deleteVendorDocument(formData: FormData) {
  "use server";
  const documentId = String(formData.get("document_id"));
  const vendorId = String(formData.get("vendor_id"));
  await softDeleteDocument(documentId);
  revalidatePath(`/vendors/${vendorId}`);
}

// LED-45 ──────────────────────────────────────────────────────────────────

const DELIVERY_METHODS = ["email", "mail", "in_person"] as const;
type DeliveryMethod = (typeof DELIVERY_METHODS)[number];

async function mark1099Delivered(formData: FormData) {
  "use server";
  const vendorId = String(formData.get("vendor_id"));
  const taxYear = parseInt(String(formData.get("tax_year")), 10);
  const methodRaw = String(formData.get("method"));
  const notes = String(formData.get("notes") ?? "").trim();

  if (!Number.isInteger(taxYear) || taxYear < 2000 || taxYear > 2100) {
    throw new Error("Invalid tax year");
  }
  if (!(DELIVERY_METHODS as readonly string[]).includes(methodRaw)) {
    throw new Error("Invalid delivery method");
  }
  const method = methodRaw as DeliveryMethod;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Upsert — if a delivery already exists for (year, vendor), update it
  // (lets the user correct a wrong method/notes without deleting first).
  const { error } = await (supabase.from("form_1099_deliveries") as any)
    .upsert(
      {
        tax_year: taxYear,
        vendor_id: vendorId,
        method,
        notes: notes || null,
        delivered_by: user?.id ?? null,
        delivered_at: new Date().toISOString(),
      },
      { onConflict: "tax_year,vendor_id" },
    );
  if (error) throw new Error(`Mark delivered failed: ${error.message}`);

  await logAudit({
    action: AUDIT_ACTIONS.FORM_1099_DELIVERED,
    entityType: "vendor",
    entityId: vendorId,
    metadata: { tax_year: taxYear, method, has_notes: notes.length > 0 },
  });

  revalidatePath(`/vendors/${vendorId}`);
  revalidatePath("/vendors");
}

async function unmark1099Delivered(formData: FormData) {
  "use server";
  const deliveryId = String(formData.get("delivery_id"));
  const vendorId = String(formData.get("vendor_id"));

  const supabase = await createClient();
  const { error } = await supabase
    .from("form_1099_deliveries")
    .delete()
    .eq("id", deliveryId);
  if (error) throw new Error(`Unmark delivered failed: ${error.message}`);

  await logAudit({
    action: AUDIT_ACTIONS.FORM_1099_DELIVERED,
    entityType: "vendor",
    entityId: vendorId,
    metadata: { unmarked: true, delivery_id: deliveryId },
  });

  revalidatePath(`/vendors/${vendorId}`);
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

// LED-38: Tax ID set / clear. Stored encrypted (utils/tax-id). Revealing the
// full value is a separate, audit-logged endpoint; setting/clearing is logged
// here too (TIN_UPDATE — no plaintext in the log).
async function setVendorTaxId(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  const normalized = normalizeTaxId(String(formData.get("tax_id") ?? ""));
  if (!isValidTaxId(normalized)) {
    throw new Error("Tax ID must be 9 digits (SSN or EIN).");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("vendors")
    .update({ tax_id_encrypted: encryptTaxId(normalized) })
    .eq("id", id);
  if (error) throw new Error(`Tax ID save failed: ${error.message}`);

  await logAudit({
    action: AUDIT_ACTIONS.TIN_UPDATE,
    entityType: "vendor",
    entityId: id,
    metadata: { set: true },
  });

  revalidatePath(`/vendors/${id}`);
}

async function clearVendorTaxId(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));

  const supabase = await createClient();
  const { error } = await supabase
    .from("vendors")
    .update({ tax_id_encrypted: null })
    .eq("id", id);
  if (error) throw new Error(`Tax ID remove failed: ${error.message}`);

  await logAudit({
    action: AUDIT_ACTIONS.TIN_UPDATE,
    entityType: "vendor",
    entityId: id,
    metadata: { cleared: true },
  });

  revalidatePath(`/vendors/${id}`);
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

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// LED-40: one named-slot row in the Documents section.
function DocumentSlot({
  vendorId,
  tag,
  label,
  doc,
  uploadAction,
  deleteAction,
}: {
  vendorId: string;
  tag: VendorDocTag;
  label: string;
  doc: DocumentRow | null;
  uploadAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-sm text-zinc-300 w-48 shrink-0">{label}</span>
      {doc ? (
        <span className="flex items-baseline justify-end gap-3 flex-1 min-w-0 text-sm">
          <a
            href={`/api/documents/${doc.id}/download`}
            className="text-zinc-100 hover:underline truncate"
          >
            {doc.original_filename}
          </a>
          <span className="text-xs text-zinc-500 tabular-nums shrink-0">
            {formatBytes(doc.size_bytes)}
          </span>
          <form action={deleteAction} className="print:hidden">
            <input type="hidden" name="document_id" value={doc.id} />
            <input type="hidden" name="vendor_id" value={vendorId} />
            <button
              type="submit"
              className="text-xs text-zinc-500 hover:text-red-300"
              title="Delete (upload a new file to replace)"
            >
              ×
            </button>
          </form>
        </span>
      ) : (
        <form
          action={uploadAction}
          encType="multipart/form-data"
          className="print:hidden flex items-center gap-2 flex-1 min-w-0 justify-end"
        >
          <input type="hidden" name="vendor_id" value={vendorId} />
          <input type="hidden" name="tag" value={tag} />
          <input
            type="file"
            name="file"
            required
            className="text-xs text-zinc-400 file:mr-2 file:rounded-md file:border-0 file:bg-zinc-800 file:px-2 file:py-1 file:text-xs file:text-zinc-200 hover:file:bg-zinc-700"
          />
          <button
            type="submit"
            className="rounded-md border border-zinc-800 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            Upload
          </button>
        </form>
      )}
    </div>
  );
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
        "id, name, dba, vendor_type, contact_name, contact_email, contact_phone, billing_address, payment_method, default_expense_category, is_1099_eligible, business_classification, w9_status, status, notes, created_at, updated_at, tax_id_encrypted",
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

  // LED-40: documents for this vendor, grouped by named slot.
  let documents: DocumentRow[] = [];
  if (vendor) {
    try {
      documents = await listDocumentsForEntity("vendor", vendor.id);
    } catch {
      // Fail soft — show empty slots rather than crashing the whole page.
      documents = [];
    }
  }

  // LED-45: 1099 delivery history for this vendor (most recent year first).
  type Form1099Delivery = {
    id: string;
    tax_year: number;
    delivered_at: string;
    method: string;
    notes: string | null;
  };
  let deliveries: Form1099Delivery[] = [];
  if (vendor && vendor.is_1099_eligible) {
    const { data: delivData } = await supabase
      .from("form_1099_deliveries")
      .select("id, tax_year, delivered_at, method, notes")
      .eq("vendor_id", vendor.id)
      .order("tax_year", { ascending: false });
    deliveries = (delivData ?? []) as Form1099Delivery[];
  }
  // Filing year for the form default: prior calendar year past Jan 31, else current.
  const today = new Date();
  const _pastJan31 =
    today.getMonth() > 0 || (today.getMonth() === 0 && today.getDate() > 31);
  const filingYear = _pastJan31 ? today.getFullYear() - 1 : today.getFullYear();
  // Newest doc per tag wins the slot; older docs with the same tag fall to "Other".
  const slotDocs: Record<VendorDocTag, DocumentRow | null> = {
    w9: null,
    contract: null,
    coi: null,
    other: null,
  };
  const otherDocs: DocumentRow[] = [];
  for (const d of documents) {
    const tag = d.tags.find((t) =>
      (VENDOR_DOC_TAGS as readonly string[]).includes(t),
    ) as VendorDocTag | undefined;
    if (tag && tag !== "other" && !slotDocs[tag]) {
      slotDocs[tag] = d;
    } else {
      otherDocs.push(d);
    }
  }

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

  // LED-38: decrypt server-side ONLY to compute the masked display. The full
  // TIN never leaves the server here — the client gets just the mask. The
  // reveal endpoint is the only path that returns plaintext (and logs it).
  let taxIdMasked: string | null = null;
  const taxIdOnFile = !!vendor.tax_id_encrypted;
  if (taxIdOnFile) {
    try {
      taxIdMasked = maskTaxId(
        decryptTaxId(vendor.tax_id_encrypted as string),
        tinTypeForClassification(vendor.business_classification),
      );
    } catch {
      // Key mismatch or corrupt blob — show a neutral placeholder, never crash.
      taxIdMasked = "•••••••••";
    }
  }

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
          <div className="flex items-baseline justify-between mb-2">
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              Recent bills
            </p>
            {bills.length > 0 && (
              <Link
                href={`/bills?tab=all&vendor=${vendor.id}`}
                className="print:hidden text-xs text-zinc-500 hover:text-zinc-200"
              >
                View all →
              </Link>
            )}
          </div>
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
              <div className="flex gap-2 items-center">
                <dt className="text-zinc-500 w-32 shrink-0">Tax ID</dt>
                <dd className="text-zinc-200">
                  {taxIdOnFile && taxIdMasked ? (
                    <RevealTin vendorId={vendor.id} masked={taxIdMasked} />
                  ) : (
                    <span className="text-zinc-500 italic">Not on file</span>
                  )}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-zinc-500 w-32 shrink-0">W-9 file</dt>
                <dd className="text-zinc-300">
                  {slotDocs.w9 ? (
                    <span className="text-emerald-300">on file</span>
                  ) : (
                    <span className="text-zinc-500 italic">not uploaded</span>
                  )}
                  <span className="text-zinc-600"> · upload below</span>
                </dd>
              </div>
            </dl>

            {/* LED-38: Tax ID entry / replace / remove */}
            <div className="print:hidden mt-4 pt-4 border-t border-zinc-800">
              <form
                action={setVendorTaxId}
                className="flex flex-wrap items-end gap-2"
              >
                <input type="hidden" name="id" value={vendor.id} />
                <div>
                  <label
                    htmlFor="tax_id"
                    className="block text-xs uppercase tracking-wide text-zinc-500 mb-1"
                  >
                    {taxIdOnFile ? "Replace tax ID" : "Add tax ID"} (SSN or EIN)
                  </label>
                  <input
                    id="tax_id"
                    name="tax_id"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="9 digits"
                    className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600 font-mono"
                  />
                </div>
                <button
                  type="submit"
                  className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800"
                >
                  Save
                </button>
                {taxIdOnFile && (
                  <button
                    type="submit"
                    formAction={clearVendorTaxId}
                    className="text-xs text-zinc-500 hover:text-red-300"
                  >
                    Remove
                  </button>
                )}
              </form>
              <p className="text-xs text-zinc-600 mt-2">
                Stored encrypted (AES-256-GCM). Revealing the full number is
                logged to the audit trail.
              </p>
            </div>

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

        {/* LED-40: Vendor documents — named slots + other uploads */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs uppercase tracking-wide text-zinc-500 mb-3">
            Documents
          </p>
          <div className="space-y-3">
            {vendor.is_1099_eligible && (
              <DocumentSlot
                vendorId={vendor.id}
                tag="w9"
                label="W-9"
                doc={slotDocs.w9}
                uploadAction={uploadVendorDocument}
                deleteAction={deleteVendorDocument}
              />
            )}
            <DocumentSlot
              vendorId={vendor.id}
              tag="contract"
              label="Contract"
              doc={slotDocs.contract}
              uploadAction={uploadVendorDocument}
              deleteAction={deleteVendorDocument}
            />
            <DocumentSlot
              vendorId={vendor.id}
              tag="coi"
              label="Certificate of Insurance"
              doc={slotDocs.coi}
              uploadAction={uploadVendorDocument}
              deleteAction={deleteVendorDocument}
            />
          </div>

          {/* Free-form "Other documents" — misc uploads outside the three named slots */}
          <div className="mt-4 pt-4 border-t border-zinc-800">
            <p className="text-xs uppercase tracking-wide text-zinc-500 mb-2">
              Other documents
            </p>
            {otherDocs.length === 0 ? (
              <p className="text-xs text-zinc-600">No other documents uploaded.</p>
            ) : (
              <ul className="space-y-1.5 mb-3">
                {otherDocs.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-baseline justify-between gap-3 text-sm"
                  >
                    <a
                      href={`/api/documents/${d.id}/download`}
                      className="text-zinc-100 hover:underline truncate"
                    >
                      {d.original_filename}
                    </a>
                    <span className="flex items-center gap-3 shrink-0 text-xs text-zinc-500">
                      <span className="tabular-nums">
                        {formatBytes(d.size_bytes)}
                      </span>
                      <form action={deleteVendorDocument}>
                        <input type="hidden" name="document_id" value={d.id} />
                        <input type="hidden" name="vendor_id" value={vendor.id} />
                        <button
                          type="submit"
                          className="print:hidden text-zinc-500 hover:text-red-300"
                          title="Delete"
                        >
                          ×
                        </button>
                      </form>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <form
              action={uploadVendorDocument}
              encType="multipart/form-data"
              className="print:hidden flex items-center gap-2 text-sm"
            >
              <input type="hidden" name="vendor_id" value={vendor.id} />
              <input type="hidden" name="tag" value="other" />
              <input
                type="file"
                name="file"
                required
                className="text-xs text-zinc-400 file:mr-2 file:rounded-md file:border-0 file:bg-zinc-800 file:px-2 file:py-1 file:text-xs file:text-zinc-200 hover:file:bg-zinc-700"
              />
              <button
                type="submit"
                className="rounded-md border border-zinc-800 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
              >
                Upload
              </button>
            </form>
          </div>
        </div>

        {/* LED-45: 1099-NEC delivery log — only for 1099-eligible vendors */}
        {vendor.is_1099_eligible && (
          <div
            id="1099-nec-delivery"
            className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 scroll-mt-8"
          >
            <p className="text-xs uppercase tracking-wide text-zinc-500 mb-3">
              1099-NEC delivery
            </p>

            {(() => {
              const filingDelivery = deliveries.find(
                (d) => d.tax_year === filingYear,
              );
              if (filingDelivery) {
                return (
                  <div className="text-sm text-zinc-200 mb-4">
                    <span className="text-emerald-300 font-medium">
                      ✓ Delivered
                    </span>{" "}
                    <span className="text-zinc-400">for {filingYear}</span>
                    <span className="text-zinc-500 text-xs ml-2">
                      ·{" "}
                      {new Date(filingDelivery.delivered_at).toLocaleDateString(
                        "en-US",
                        { month: "short", day: "numeric", year: "numeric" },
                      )}{" "}
                      · via {filingDelivery.method.replace("_", " ")}
                    </span>
                    {filingDelivery.notes && (
                      <p className="mt-1 text-xs text-zinc-500">
                        {filingDelivery.notes}
                      </p>
                    )}
                    <form
                      action={unmark1099Delivered}
                      className="print:hidden inline-block mt-2"
                    >
                      <input type="hidden" name="delivery_id" value={filingDelivery.id} />
                      <input type="hidden" name="vendor_id" value={vendor.id} />
                      <button
                        type="submit"
                        className="text-xs text-zinc-500 hover:text-red-300"
                      >
                        × unmark
                      </button>
                    </form>
                  </div>
                );
              }
              return (
                <p className="text-sm text-zinc-400 mb-4">
                  <span className="text-amber-300">Not yet delivered</span> for {filingYear}.
                </p>
              );
            })()}

            <form
              action={mark1099Delivered}
              className="print:hidden grid grid-cols-1 md:grid-cols-[auto,1fr,auto] gap-2 items-end"
            >
              <input type="hidden" name="vendor_id" value={vendor.id} />
              <input type="hidden" name="tax_year" value={filingYear} />
              <div>
                <label className="block text-xs uppercase tracking-wide text-zinc-500 mb-1">
                  Method
                </label>
                <select
                  name="method"
                  defaultValue="email"
                  className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100"
                >
                  <option value="email">Email</option>
                  <option value="mail">Mail</option>
                  <option value="in_person">In person</option>
                </select>
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wide text-zinc-500 mb-1">
                  Notes (optional — e.g. tracking #, recipient confirmation)
                </label>
                <input
                  type="text"
                  name="notes"
                  placeholder="USPS 9405..."
                  className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600"
                />
              </div>
              <button
                type="submit"
                className="rounded-md bg-zinc-100 px-4 py-1.5 text-sm font-medium text-zinc-900 hover:bg-white"
              >
                Mark delivered ({filingYear})
              </button>
            </form>

            {deliveries.length > 0 && (
              <div className="mt-4 pt-4 border-t border-zinc-800">
                <p className="text-xs text-zinc-500 mb-2">History</p>
                <ul className="space-y-1 text-sm">
                  {deliveries.map((d) => (
                    <li
                      key={d.id}
                      className="flex items-baseline justify-between gap-3 text-zinc-300"
                    >
                      <span className="tabular-nums">
                        <span className="text-zinc-100 font-medium">
                          {d.tax_year}
                        </span>{" "}
                        <span className="text-zinc-500 text-xs ml-1">
                          · via {d.method.replace("_", " ")}
                        </span>
                      </span>
                      <span className="text-xs text-zinc-500 tabular-nums">
                        {new Date(d.delivered_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
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
