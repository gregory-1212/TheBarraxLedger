import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

// LED-7: Compliance create form.
// Edit flow lands at /compliance/[id]/edit later — same component will be reused.
// Server Action handles the insert; redirects to the new detail page on success.

const CATEGORIES = [
  { value: "federal", label: "Federal" },
  { value: "state", label: "State" },
  { value: "local", label: "Local" },
  { value: "tax", label: "Tax" },
  { value: "insurance", label: "Insurance" },
];

const JURISDICTIONS = [
  { value: "FED", label: "Federal" },
  { value: "NV", label: "Nevada" },
  { value: "TN", label: "Tennessee" },
  { value: "DAVIDSON_COUNTY", label: "Davidson County" },
  { value: "CITY_OF_NASHVILLE", label: "City of Nashville" },
];

const TYPES = [
  { value: "annual_list", label: "Annual list (NV)" },
  { value: "annual_report", label: "Annual report (TN)" },
  { value: "registered_agent_renewal", label: "Registered agent renewal" },
  { value: "member_meeting", label: "Member meeting" },
  { value: "business_license", label: "Business license" },
  { value: "sales_tax", label: "Sales tax filing" },
  { value: "ffl_renewal", label: "FFL renewal" },
  { value: "insurance_renewal", label: "Insurance renewal" },
  { value: "other", label: "Other" },
];

const CADENCES = [
  { value: "", label: "One-time" },
  { value: "1 month", label: "Monthly" },
  { value: "3 months", label: "Quarterly" },
  { value: "1 year", label: "Annual" },
  { value: "2 years", label: "Every 2 years" },
  { value: "3 years", label: "Every 3 years (FFL)" },
];

async function createComplianceItem(formData: FormData) {
  "use server";

  const title = String(formData.get("title") ?? "").trim();
  const category = String(formData.get("category") ?? "");
  const jurisdiction = String(formData.get("jurisdiction") ?? "");
  const compliance_type = String(formData.get("compliance_type") ?? "");
  const cadence_interval = String(formData.get("cadence_interval") ?? "");
  const next_due_date = String(formData.get("next_due_date") ?? "");
  const costDollarsRaw = String(formData.get("cost_dollars") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!title || !category || !jurisdiction || !compliance_type || !next_due_date) {
    throw new Error("Missing required fields");
  }

  const cost_cents = costDollarsRaw
    ? Math.round(parseFloat(costDollarsRaw) * 100)
    : null;
  if (cost_cents !== null && (isNaN(cost_cents) || cost_cents < 0)) {
    throw new Error("Invalid cost amount");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("compliance_items")
    .insert({
      title,
      category,
      jurisdiction,
      compliance_type,
      cadence_interval: cadence_interval || null,
      next_due_date,
      cost_cents,
      notes: notes || null,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Insert failed: ${error?.message ?? "unknown"}`);
  }

  redirect(`/compliance/${data.id}`);
}

export default function NewCompliancePage() {
  return (
    <div className="p-8 max-w-2xl mx-auto">
      <header className="mb-6">
        <Link
          href="/compliance"
          className="text-xs text-zinc-500 hover:text-zinc-300"
        >
          ← Back to Compliance
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight mt-2">
          Add Compliance Item
        </h1>
      </header>

      <form action={createComplianceItem} className="space-y-5">
        <div>
          <label
            htmlFor="title"
            className="block text-sm font-medium text-zinc-300 mb-1"
          >
            Title <span className="text-red-400">*</span>
          </label>
          <input
            id="title"
            name="title"
            type="text"
            required
            placeholder="e.g. Tennessee Annual Report"
            className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-zinc-700"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="category"
              className="block text-sm font-medium text-zinc-300 mb-1"
            >
              Category <span className="text-red-400">*</span>
            </label>
            <select
              id="category"
              name="category"
              required
              className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            >
              <option value="">Select…</option>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="jurisdiction"
              className="block text-sm font-medium text-zinc-300 mb-1"
            >
              Jurisdiction <span className="text-red-400">*</span>
            </label>
            <select
              id="jurisdiction"
              name="jurisdiction"
              required
              className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            >
              <option value="">Select…</option>
              {JURISDICTIONS.map((j) => (
                <option key={j.value} value={j.value}>
                  {j.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="compliance_type"
              className="block text-sm font-medium text-zinc-300 mb-1"
            >
              Type <span className="text-red-400">*</span>
            </label>
            <select
              id="compliance_type"
              name="compliance_type"
              required
              className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            >
              <option value="">Select…</option>
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="cadence_interval"
              className="block text-sm font-medium text-zinc-300 mb-1"
            >
              Cadence
            </label>
            <select
              id="cadence_interval"
              name="cadence_interval"
              defaultValue=""
              className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            >
              {CADENCES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-zinc-500 mt-1">
              Used to auto-compute next due date when this item is marked filed.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="next_due_date"
              className="block text-sm font-medium text-zinc-300 mb-1"
            >
              Next due date <span className="text-red-400">*</span>
            </label>
            <input
              id="next_due_date"
              name="next_due_date"
              type="date"
              required
              className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            />
          </div>
          <div>
            <label
              htmlFor="cost_dollars"
              className="block text-sm font-medium text-zinc-300 mb-1"
            >
              Cost (optional)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500">
                $
              </span>
              <input
                id="cost_dollars"
                name="cost_dollars"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                className="w-full rounded-md border border-zinc-800 bg-zinc-900 pl-7 pr-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 tabular-nums"
              />
            </div>
          </div>
        </div>

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
            rows={4}
            placeholder="Filing portal URL, reference numbers, internal context…"
            className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 resize-y"
          />
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            className="rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-white transition-colors"
          >
            Create item
          </button>
          <Link
            href="/compliance"
            className="text-sm text-zinc-400 hover:text-zinc-200"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
