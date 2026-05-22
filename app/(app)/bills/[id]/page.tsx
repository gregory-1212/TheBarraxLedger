import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import {
  severityForDate,
  SEVERITY_TEXT_CLASSES,
  relativeDueLabel,
} from "@/utils/severity";

// Bill detail page with mark-paid action. Closes the workflow gap where bills
// could only be marked paid at creation time.

function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatDollars(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}$${(abs / 100).toFixed(2)}`;
}

// ── Server Actions ──────────────────────────────────────────────────────

async function markPaid(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  const paid_date = String(formData.get("paid_date") ?? "").trim();
  const amount_paid_dollars = String(
    formData.get("amount_paid_dollars") ?? "",
  ).trim();
  const payment_method = String(formData.get("payment_method") ?? "").trim();

  if (!paid_date) throw new Error("paid_date is required");

  const amount_paid_cents = amount_paid_dollars
    ? Math.round(parseFloat(amount_paid_dollars) * 100)
    : null;
  if (amount_paid_cents !== null && (isNaN(amount_paid_cents) || amount_paid_cents < 0)) {
    throw new Error("Invalid amount paid");
  }

  const supabase = await createClient();
  const update: Record<string, unknown> = {
    paid_date,
    status: "paid",
  };
  if (amount_paid_cents !== null) update.amount_paid_cents = amount_paid_cents;
  if (payment_method) update.payment_method = payment_method;

  const { error } = await supabase
    .from("bills")
    .update(update)
    .eq("id", id);

  if (error) throw new Error(`Mark paid failed: ${error.message}`);

  revalidatePath(`/bills/${id}`);
  revalidatePath("/bills");
  revalidatePath("/");
}

async function unmarkPaid(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));

  const supabase = await createClient();
  const { error } = await supabase
    .from("bills")
    .update({
      paid_date: null,
      amount_paid_cents: null,
      status: "pending",
    })
    .eq("id", id);

  if (error) throw new Error(`Un-mark paid failed: ${error.message}`);

  revalidatePath(`/bills/${id}`);
  revalidatePath("/bills");
  revalidatePath("/");
}

async function softDeleteBill(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));

  const supabase = await createClient();
  const { error } = await supabase
    .from("bills")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null);

  if (error) throw new Error(`Delete failed: ${error.message}`);

  revalidatePath("/bills");
  redirect("/bills");
}

// ────────────────────────────────────────────────────────────────────────

type BillDetail = {
  id: string;
  amount_cents: number;
  amount_paid_cents: number | null;
  due_date: string;
  paid_date: string | null;
  status: string;
  payment_method: string | null;
  reference: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  vendor: { id: string; name: string } | null;
  expense_category: { name: string } | null;
};

export default async function BillDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("bills")
    .select(
      "id, amount_cents, amount_paid_cents, due_date, paid_date, status, payment_method, reference, notes, created_at, updated_at, vendor:vendors(id, name), expense_category:expense_categories(name)",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <div className="rounded-md border border-red-900/50 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          Couldn&apos;t load bill: {error.message}
        </div>
      </div>
    );
  }

  if (!data) notFound();

  // Cast around Supabase's array-vs-object typing for FK joins
  const bill = data as unknown as BillDetail;
  const isPaid = !!bill.paid_date;

  const severity = severityForDate(bill.due_date, { paid: isPaid });
  const dueSeverityClass = SEVERITY_TEXT_CLASSES[severity];

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <header className="mb-6">
        <Link
          href="/bills"
          className="print:hidden text-xs text-zinc-500 hover:text-zinc-300"
        >
          ← Back to Bills
        </Link>
        <div className="flex items-start justify-between gap-4 mt-2">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {bill.vendor ? (
                <Link
                  href={`/vendors/${bill.vendor.id}`}
                  className="hover:underline"
                >
                  {bill.vendor.name}
                </Link>
              ) : (
                <span className="text-zinc-500">Unknown vendor</span>
              )}
            </h1>
            <p className="text-3xl font-semibold text-zinc-100 tabular-nums mt-2">
              {formatDollars(bill.amount_cents)}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {bill.expense_category && (
                <span className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-xs text-zinc-300">
                  {bill.expense_category.name}
                </span>
              )}
              <span className="text-xs uppercase tracking-wide text-zinc-500 ml-1">
                {bill.status}
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs uppercase tracking-wide text-zinc-500">
            {isPaid ? "Was due" : "Due"}
          </p>
          <p className="text-lg font-medium text-zinc-100 mt-1">
            {formatDate(bill.due_date)}
          </p>
          {!isPaid && (
            <p className={`text-xs mt-1 ${dueSeverityClass}`}>
              {relativeDueLabel(bill.due_date)}
            </p>
          )}
        </div>
        {isPaid && bill.paid_date && (
          <div className="rounded-lg border border-emerald-900/50 bg-emerald-950/30 p-4">
            <p className="text-xs uppercase tracking-wide text-emerald-400">
              Paid
            </p>
            <p className="text-lg font-medium text-emerald-100 mt-1">
              {formatDate(bill.paid_date)}
            </p>
            {bill.amount_paid_cents !== null &&
              bill.amount_paid_cents !== bill.amount_cents && (
                <p className="text-xs text-emerald-300 mt-1 tabular-nums">
                  Paid {formatDollars(bill.amount_paid_cents)} of{" "}
                  {formatDollars(bill.amount_cents)} (partial)
                </p>
              )}
          </div>
        )}
        {bill.payment_method && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              Payment method
            </p>
            <p className="text-sm text-zinc-200 mt-1">{bill.payment_method}</p>
          </div>
        )}
        {bill.reference && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              Reference
            </p>
            <p className="text-sm text-zinc-200 mt-1 font-mono break-all">
              {bill.reference}
            </p>
          </div>
        )}
      </div>

      {bill.notes && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 mb-6">
          <p className="text-xs uppercase tracking-wide text-zinc-500 mb-2">
            Notes
          </p>
          <p className="text-sm text-zinc-200 whitespace-pre-wrap">
            {bill.notes}
          </p>
        </div>
      )}

      {/* Action panel */}
      <div className="print:hidden rounded-lg border border-zinc-800 bg-zinc-900 p-5 mb-6">
        {isPaid ? (
          <div className="flex flex-wrap items-center gap-3">
            <form action={unmarkPaid}>
              <input type="hidden" name="id" value={bill.id} />
              <button
                type="submit"
                className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800"
              >
                Un-mark paid
              </button>
            </form>
            <p className="text-xs text-zinc-500">
              Reverts to pending and clears the paid date / amount paid.
            </p>
          </div>
        ) : (
          <form action={markPaid} className="space-y-3">
            <input type="hidden" name="id" value={bill.id} />
            <p className="text-xs uppercase tracking-wide text-zinc-500 mb-2">
              Mark paid
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label
                  htmlFor="paid_date"
                  className="block text-xs text-zinc-400 mb-1"
                >
                  Paid date <span className="text-red-400">*</span>
                </label>
                <input
                  id="paid_date"
                  name="paid_date"
                  type="date"
                  required
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                />
              </div>
              <div>
                <label
                  htmlFor="amount_paid_dollars"
                  className="block text-xs text-zinc-400 mb-1"
                >
                  Amount paid
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500">
                    $
                  </span>
                  <input
                    id="amount_paid_dollars"
                    name="amount_paid_dollars"
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={(bill.amount_cents / 100).toFixed(2)}
                    className="w-full rounded-md border border-zinc-800 bg-zinc-950 pl-7 pr-3 py-2 text-sm text-zinc-100 tabular-nums"
                  />
                </div>
              </div>
              <div>
                <label
                  htmlFor="payment_method"
                  className="block text-xs text-zinc-400 mb-1"
                >
                  Payment method
                </label>
                <input
                  id="payment_method"
                  name="payment_method"
                  type="text"
                  defaultValue={bill.payment_method ?? ""}
                  placeholder="optional"
                  className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                />
              </div>
            </div>
            <button
              type="submit"
              className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-emerald-50 hover:bg-emerald-600"
            >
              Mark paid
            </button>
          </form>
        )}
      </div>

      <div className="print:hidden flex items-center gap-3 mb-6">
        <form action={softDeleteBill}>
          <input type="hidden" name="id" value={bill.id} />
          <button
            type="submit"
            className="text-xs text-red-400 hover:text-red-300"
          >
            Delete bill
          </button>
        </form>
      </div>

      <p className="text-xs text-zinc-600">
        Created {new Date(bill.created_at).toLocaleDateString()} · Updated{" "}
        {new Date(bill.updated_at).toLocaleDateString()}
      </p>
    </div>
  );
}
