import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

// Bill edit form. Mirrors /bills/new structure with pre-filled values.
// paid_date / amount_paid / payment_method are also edited inline on the
// detail page via the mark-paid action — this form is for the descriptive
// fields (vendor, amount due, due date, category, reference, notes).

async function updateBill(formData: FormData) {
  "use server";

  const id = String(formData.get("id"));
  if (!id) throw new Error("Missing id");

  const vendor_id = String(formData.get("vendor_id") ?? "");
  const amount_dollars = String(formData.get("amount_dollars") ?? "").trim();
  const due_date = String(formData.get("due_date") ?? "");
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
  const { error } = await supabase
    .from("bills")
    .update({
      vendor_id,
      amount_cents,
      due_date,
      expense_category_id: expense_category_id || null,
      payment_method: payment_method || null,
      reference: reference || null,
      notes: notes || null,
    })
    .eq("id", id);

  if (error) {
    throw new Error(`Bill update failed: ${error.message}`);
  }

  redirect(`/bills/${id}`);
}

export default async function EditBillPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [billResult, vendorsResult, categoriesResult] = await Promise.all([
    supabase
      .from("bills")
      .select(
        "id, vendor_id, amount_cents, due_date, expense_category_id, payment_method, reference, notes",
      )
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("vendors")
      .select("id, name")
      .is("deleted_at", null)
      .order("name", { ascending: true }),
    supabase
      .from("expense_categories")
      .select("id, name")
      .is("deleted_at", null)
      .order("sort_order", { ascending: true }),
  ]);

  const { data: bill, error } = billResult;
  const vendors = vendorsResult.data ?? [];
  const categories = categoriesResult.data ?? [];

  if (error) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <div className="rounded-md border border-red-900/50 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          Couldn&apos;t load bill: {error.message}
        </div>
      </div>
    );
  }

  if (!bill) notFound();

  const amount_dollars_default = (bill.amount_cents / 100).toFixed(2);

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <header className="mb-6">
        <Link
          href={`/bills/${bill.id}`}
          className="text-xs text-zinc-500 hover:text-zinc-300"
        >
          ← Back to bill
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight mt-2">Edit Bill</h1>
      </header>

      <form action={updateBill} className="space-y-5">
        <input type="hidden" name="id" value={bill.id} />

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
            defaultValue={bill.vendor_id}
            className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          >
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
                defaultValue={amount_dollars_default}
                className="w-full rounded-md border border-zinc-800 bg-zinc-900 pl-7 pr-3 py-2 text-sm text-zinc-100 tabular-nums"
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
              defaultValue={bill.expense_category_id ?? ""}
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
            defaultValue={bill.due_date}
            className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          />
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
              defaultValue={bill.payment_method ?? ""}
              className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
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
              defaultValue={bill.reference ?? ""}
              className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
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
            defaultValue={bill.notes ?? ""}
            className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 resize-y"
          />
        </div>

        <p className="text-xs text-zinc-500">
          Mark-paid (paid date, amount paid, payment method) is handled by the
          inline action on the bill detail page.
        </p>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            className="rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-white transition-colors"
          >
            Save changes
          </button>
          <Link
            href={`/bills/${bill.id}`}
            className="text-sm text-zinc-400 hover:text-zinc-200"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
