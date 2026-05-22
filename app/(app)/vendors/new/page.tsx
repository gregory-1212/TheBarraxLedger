import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

// LED-14: Vendor create form.
// Skips TIN entry (LED-38 wires the encryption + reveal endpoint) and the
// self-service W-9 flow (LED-46, V2). 1099 fields are toggle-revealed when
// is_1099_eligible=true; W-9 status defaults to 'missing' for those vendors.

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

async function createVendor(formData: FormData) {
  "use server";

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
  const { data, error } = await supabase
    .from("vendors")
    .insert({
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
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Vendor create failed: ${error?.message ?? "unknown"}`);
  }

  redirect(`/vendors/${data.id}`);
}

export default async function NewVendorPage() {
  const supabase = await createClient();
  const { data: categories } = await supabase
    .from("expense_categories")
    .select("name")
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <header className="mb-6">
        <Link
          href="/vendors"
          className="text-xs text-zinc-500 hover:text-zinc-300"
        >
          ← Back to Vendors
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight mt-2">
          Add Vendor
        </h1>
      </header>

      <form action={createVendor} className="space-y-5">
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
              placeholder="e.g. Vercel Inc."
              className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-zinc-700"
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
              placeholder="Display alias"
              className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
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
              className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            >
              <option value="">Select…</option>
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
              placeholder="Contact name"
              className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
            />
            <input
              name="contact_email"
              type="email"
              placeholder="contact@vendor.com"
              className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
            />
          </div>
          <input
            name="contact_phone"
            type="tel"
            placeholder="Phone"
            className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
          />
          <textarea
            name="billing_address"
            rows={2}
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
              placeholder="e.g. Visa ending 1234"
              className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
            />
            <select
              name="default_expense_category"
              defaultValue=""
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
              defaultValue=""
              className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            >
              {BUSINESS_CLASSIFICATIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-zinc-500 mt-1">
              Corps don&apos;t need 1099-NEC; individuals + sole props + LLCs
              + partnerships do.
            </p>
          </div>
          <p className="text-xs text-zinc-500">
            Tax ID + W-9 upload come on the vendor detail page after creation.
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
            placeholder="Contract terms, account number, internal context…"
            className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 resize-y"
          />
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            className="rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-white transition-colors"
          >
            Create vendor
          </button>
          <Link
            href="/vendors"
            className="text-sm text-zinc-400 hover:text-zinc-200"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
