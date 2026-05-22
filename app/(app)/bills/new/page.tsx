import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

// LED-19: Add Bill form.
// Per research/bills.md: vendor typeahead + auto-fill from prior bills.
// For V1 a simple dropdown is fine — typeahead is a nice-to-have when vendor
// count grows. Receipt drag-drop comes later via LED-34 documents archive.

async function createBill(formData: FormData) {
  "use server";

  const vendor_id = String(formData.get("vendor_id") ?? "");
  const amount_dollars = String(formData.get("amount_dollars") ?? "").trim();
  const due_date = String(formData.get("due_date") ?? "");
  const paid_date = String(formData.get("paid_date") ?? "");
  const expense_category_id = String(formData.get("expense_category_id") ?? "");
  const payment_method = String(formData.get("payment_method") ?? "").trim();
  const reference = String(formData.get("reference") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!vendor_id || !amount_dollars || !due_date) {
    throw new Error("Missing required fields");
  }

  const amount_cents = Math.round(parseFloat(amount_dollars) * 100);
  if (isNaN(amount_cents) || amount_cents < 0) {
    throw new Error("Invalid amount");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("bills").insert({
    vendor_id,
    amount_cents,
    amount_paid_cents: paid_date ? amount_cents : null,
    due_date,
    paid_date: paid_date || null,
    expense_category_id: expense_category_id || null,
    payment_method: payment_method || null,
    reference: reference || null,
    notes: notes || null,
    status: paid_date ? "paid" : "pending",
  });

  if (error) {
    throw new Error(`Bill create failed: ${error.message}`);
  }

  redirect("/bills");
}

export default async function NewBillPage() {
  const supabase = await createClient();

  const [vendorsResult, categoriesResult] = await Promise.all([
    supabase
      .from("vendors")
      .select("id, name, default_expense_category, payment_method")
      .is("deleted_at", null)
      .eq("status", "active")
      .order("name", { ascending: true }),
    supabase
      .from("expense_categories")
      .select("id, name")
      .is("deleted_at", null)
      .order("sort_order", { ascending: true }),
  ]);

  const vendors = vendorsResult.data ?? [];
  const categories = categoriesResult.data ?? [];

  // No vendors yet → can't create a bill. Guide user to add a vendor first.
  if (vendors.length === 0) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <header className="mb-6">
          <Link
            href="/bills"
            className="text-xs text-zinc-500 hover:text-zinc-300"
          >
            ← Back to Bills
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight mt-2">
            Add Bill
          </h1>
        </header>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6 text-center">
          <p className="text-sm text-zinc-300 mb-2">No active vendors yet.</p>
          <p className="text-xs text-zinc-500 mb-4">
            Bills belong to a vendor — add one first.
          </p>
          <Link
            href="/vendors/new"
            className="inline-block rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-white transition-colors"
          >
            Add Vendor
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <header className="mb-6">
        <Link
          href="/bills"
          className="text-xs text-zinc-500 hover:text-zinc-300"
        >
          ← Back to Bills
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight mt-2">Add Bill</h1>
      </header>

      <form action={createBill} className="space-y-5">
        <div>
          <label
            htmlFor="vendor_id"
            className="block text-sm font-medium text-zinc-300 mb-1"
          >
            Vendor <span className="text-red-400">*</span>
          </label>
          <select
            id="vendor_id"
            name="vendor_id"
            required
            className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          >
            <option value="">Select…</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="amount_dollars"
              className="block text-sm font-medium text-zinc-300 mb-1"
            >
              Amount <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500">
                $
              </span>
              <input
                id="amount_dollars"
                name="amount_dollars"
                type="number"
                step="0.01"
                min="0"
                required
                placeholder="0.00"
                className="w-full rounded-md border border-zinc-800 bg-zinc-900 pl-7 pr-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 tabular-nums"
              />
            </div>
          </div>
          <div>
            <label
              htmlFor="expense_category_id"
              className="block text-sm font-medium text-zinc-300 mb-1"
            >
              Category
            </label>
            <select
              id="expense_category_id"
              name="expense_category_id"
              defaultValue=""
              className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            >
              <option value="">Uncategorized</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="due_date"
              className="block text-sm font-medium text-zinc-300 mb-1"
            >
              Due date <span className="text-red-400">*</span>
            </label>
            <input
              id="due_date"
              name="due_date"
              type="date"
              required
              className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            />
          </div>
          <div>
            <label
              htmlFor="paid_date"
              className="block text-sm font-medium text-zinc-300 mb-1"
            >
              Paid date (if already paid)
            </label>
            <input
              id="paid_date"
              name="paid_date"
              type="date"
              className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="payment_method"
              className="block text-sm font-medium text-zinc-300 mb-1"
            >
              Payment method
            </label>
            <input
              id="payment_method"
              name="payment_method"
              type="text"
              placeholder="e.g. Visa ending 1234"
              className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
            />
          </div>
          <div>
            <label
              htmlFor="reference"
              className="block text-sm font-medium text-zinc-300 mb-1"
            >
              Reference (invoice #, etc.)
            </label>
            <input
              id="reference"
              name="reference"
              type="text"
              placeholder="Optional"
              className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
            />
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
            rows={3}
            placeholder="Optional context"
            className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 resize-y"
          />
        </div>

        <p className="text-xs text-zinc-500">
          Recurring bills + receipt attachment come later (LED-20, LED-34).
        </p>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            className="rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-white transition-colors"
          >
            Create bill
          </button>
          <Link
            href="/bills"
            className="text-sm text-zinc-400 hover:text-zinc-200"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
