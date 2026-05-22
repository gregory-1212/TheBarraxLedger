import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

// Vendor edit form. Mirrors /vendors/new structure with pre-filled values.
// W-9 status, 1099 eligibility toggle, and vendor.status are edited via
// dedicated actions on the detail page (LED-43, LED-39) — this form only
// covers the descriptive fields.

const VENDOR_TYPES = [
  { value: "subscription", label: "Subscription" },
  { value: "utility", label: "Utility" },
  { value: "contractor", label: "Contractor (1099)" },
  { value: "supplier", label: "Supplier" },
  { value: "government", label: "Government" },
  { value: "other", label: "Other" },
];

const BUSINESS_CLASSIFICATIONS = [
  { value: "", label: "Unknown" },
  { value: "individual", label: "Individual / Sole Prop" },
  { value: "partnership", label: "Partnership" },
  { value: "llc", label: "LLC" },
  { value: "c_corporation", label: "C Corporation" },
  { value: "s_corporation", label: "S Corporation" },
  { value: "tax_exempt", label: "Tax-exempt" },
  { value: "other", label: "Other" },
];

async function updateVendor(formData: FormData) {
  "use server";

  const id = String(formData.get("id"));
  if (!id) throw new Error("Missing id");

  const name = String(formData.get("name") ?? "").trim();
  const dba = String(formData.get("dba") ?? "").trim();
  const vendor_type = String(formData.get("vendor_type") ?? "");
  const contact_name = String(formData.get("contact_name") ?? "").trim();
  const contact_email = String(formData.get("contact_email") ?? "").trim();
  const contact_phone = String(formData.get("contact_phone") ?? "").trim();
  const billing_address = String(formData.get("billing_address") ?? "").trim();
  const payment_method = String(formData.get("payment_method") ?? "").trim();
  const default_expense_category = String(
    formData.get("default_expense_category") ?? "",
  ).trim();
  const is_1099_eligible = formData.get("is_1099_eligible") === "on";
  const business_classification = String(
    formData.get("business_classification") ?? "",
  );
  const notes = String(formData.get("notes") ?? "").trim();

  if (!name || !vendor_type) {
    throw new Error("Missing required fields");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("vendors")
    .update({
      name,
      dba: dba || null,
      vendor_type,
      contact_name: contact_name || null,
      contact_email: contact_email || null,
      contact_phone: contact_phone || null,
      billing_address: billing_address || null,
      payment_method: payment_method || null,
      default_expense_category: default_expense_category || null,
      is_1099_eligible,
      business_classification: business_classification || null,
      notes: notes || null,
    })
    .eq("id", id);

  if (error) {
    throw new Error(`Vendor update failed: ${error.message}`);
  }

  redirect(`/vendors/${id}`);
}

export default async function EditVendorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [vendorResult, categoriesResult] = await Promise.all([
    supabase
      .from("vendors")
      .select(
        "id, name, dba, vendor_type, contact_name, contact_email, contact_phone, billing_address, payment_method, default_expense_category, is_1099_eligible, business_classification, notes",
      )
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("expense_categories")
      .select("name")
      .is("deleted_at", null)
      .order("sort_order", { ascending: true }),
  ]);

  const { data: vendor, error } = vendorResult;
  const categories = categoriesResult.data ?? [];

  if (error) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <div className="rounded-md border border-red-900/50 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          Couldn&apos;t load vendor: {error.message}
        </div>
      </div>
    );
  }

  if (!vendor) notFound();

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <header className="mb-6">
        <Link
          href={`/vendors/${vendor.id}`}
          className="text-xs text-zinc-500 hover:text-zinc-300"
        >
          ← Back to vendor
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight mt-2">
          Edit Vendor
        </h1>
      </header>

      <form action={updateVendor} className="space-y-5">
        <input type="hidden" name="id" value={vendor.id} />

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label
              htmlFor="name"
              className="block text-sm font-medium text-zinc-300 mb-1"
            >
              Legal name <span className="text-red-400">*</span>
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              defaultValue={vendor.name}
              className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-700"
            />
          </div>

          <div>
            <label
              htmlFor="dba"
              className="block text-sm font-medium text-zinc-300 mb-1"
            >
              DBA (optional)
            </label>
            <input
              id="dba"
              name="dba"
              type="text"
              defaultValue={vendor.dba ?? ""}
              className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            />
          </div>

          <div>
            <label
              htmlFor="vendor_type"
              className="block text-sm font-medium text-zinc-300 mb-1"
            >
              Type <span className="text-red-400">*</span>
            </label>
            <select
              id="vendor_type"
              name="vendor_type"
              required
              defaultValue={vendor.vendor_type}
              className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            >
              {VENDOR_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <fieldset className="space-y-3">
          <legend className="text-xs uppercase tracking-wide text-zinc-500 font-medium mb-2">
            Contact
          </legend>
          <div className="grid grid-cols-2 gap-4">
            <input
              name="contact_name"
              type="text"
              defaultValue={vendor.contact_name ?? ""}
              placeholder="Contact name"
              className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
            />
            <input
              name="contact_email"
              type="email"
              defaultValue={vendor.contact_email ?? ""}
              placeholder="contact@vendor.com"
              className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
            />
          </div>
          <input
            name="contact_phone"
            type="tel"
            defaultValue={vendor.contact_phone ?? ""}
            placeholder="Phone"
            className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
          />
          <textarea
            name="billing_address"
            rows={2}
            defaultValue={vendor.billing_address ?? ""}
            placeholder="Billing address"
            className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 resize-y"
          />
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-xs uppercase tracking-wide text-zinc-500 font-medium mb-2">
            Payment defaults
          </legend>
          <div className="grid grid-cols-2 gap-4">
            <input
              name="payment_method"
              type="text"
              defaultValue={vendor.payment_method ?? ""}
              placeholder="e.g. Visa ending 1234"
              className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
            />
            <select
              name="default_expense_category"
              defaultValue={vendor.default_expense_category ?? ""}
              className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            >
              <option value="">No default category</option>
              {(categories ?? []).map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-xs uppercase tracking-wide text-zinc-500 font-medium mb-2">
            1099 / tax
          </legend>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              name="is_1099_eligible"
              defaultChecked={vendor.is_1099_eligible}
              className="rounded border-zinc-700 bg-zinc-900"
            />
            1099-eligible — track payments toward the $600 NEC threshold
          </label>
          <div>
            <label
              htmlFor="business_classification"
              className="block text-xs text-zinc-400 mb-1"
            >
              Business classification
            </label>
            <select
              id="business_classification"
              name="business_classification"
              defaultValue={vendor.business_classification ?? ""}
              className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            >
              {BUSINESS_CLASSIFICATIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-zinc-500">
            W-9 status, vendor active/hold/archive state, and tax ID are
            edited via dedicated actions on the vendor detail page.
          </p>
        </fieldset>

        <div>
          <label
            htmlFor="notes"
            className="block text-sm font-medium text-zinc-300 mb-1"
          >
            Notes
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            defaultValue={vendor.notes ?? ""}
            placeholder="Contract terms, account number, internal context…"
            className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 resize-y"
          />
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            className="rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-white transition-colors"
          >
            Save changes
          </button>
          <Link
            href={`/vendors/${vendor.id}`}
            className="text-sm text-zinc-400 hover:text-zinc-200"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
