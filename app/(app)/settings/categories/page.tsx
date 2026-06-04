import Link from "next/link";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

// LED: self-serve expense-category management. Staff can add, rename, change the
// tax treatment, retire (soft-delete via deleted_at — reversible) and restore
// categories used to tag bills + receipts. RLS allows staff insert/update; there
// is no hard delete (retire = set deleted_at), so a category referenced by old
// bills/receipts keeps its history and just stops appearing in pickers.

const TAX_TREATMENTS = [
  { value: "deductible", label: "Deductible" },
  { value: "non_deductible", label: "Non-deductible" },
  { value: "capital_expense", label: "Capital expense" },
] as const;
const TAX_VALUES = TAX_TREATMENTS.map((t) => t.value);
const taxLabel = (v: string) => TAX_TREATMENTS.find((t) => t.value === v)?.label ?? v;

type Category = {
  id: string;
  name: string;
  tax_treatment: string;
  sort_order: number;
  deleted_at: string | null;
};

async function createCategory(formData: FormData) {
  "use server";
  const name = String(formData.get("name") ?? "").trim();
  const tax_treatment = String(formData.get("tax_treatment") ?? "deductible");
  if (!name) throw new Error("Category name is required");
  if (!TAX_VALUES.includes(tax_treatment as (typeof TAX_VALUES)[number])) throw new Error("Invalid tax treatment");

  const supabase = await createClient();
  // New categories sort to the end (just before "Other" at 900).
  const { data: maxRow } = await (supabase.from("expense_categories") as any)
    .select("sort_order").is("deleted_at", null).lt("sort_order", 900)
    .order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const sort_order = Math.min(890, ((maxRow?.sort_order as number) ?? 100) + 10);

  const { error } = await (supabase.from("expense_categories") as any)
    .insert({ name, tax_treatment, sort_order });
  if (error) {
    if (error.code === "23505") throw new Error(`A category named "${name}" already exists`);
    throw new Error(error.message);
  }
  revalidatePath("/settings/categories");
}

async function updateCategory(formData: FormData) {
  "use server";
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const tax_treatment = String(formData.get("tax_treatment") ?? "");
  if (!id || !name) throw new Error("Name is required");
  if (!TAX_VALUES.includes(tax_treatment as (typeof TAX_VALUES)[number])) throw new Error("Invalid tax treatment");

  const supabase = await createClient();
  const { error } = await (supabase.from("expense_categories") as any)
    .update({ name, tax_treatment }).eq("id", id);
  if (error) {
    if (error.code === "23505") throw new Error(`A category named "${name}" already exists`);
    throw new Error(error.message);
  }
  revalidatePath("/settings/categories");
}

async function setDeleted(formData: FormData) {
  "use server";
  const id = String(formData.get("id") ?? "");
  const retire = String(formData.get("retire") ?? "") === "true";
  if (!id) throw new Error("Missing category");
  const supabase = await createClient();
  const { error } = await (supabase.from("expense_categories") as any)
    .update({ deleted_at: retire ? new Date().toISOString() : null }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/settings/categories");
}

export default async function CategoriesSettingsPage() {
  const supabase = await createClient();
  const { data } = await (supabase.from("expense_categories") as any)
    .select("id, name, tax_treatment, sort_order, deleted_at")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  const all = (data as Category[] | null) ?? [];
  const active = all.filter((c) => !c.deleted_at);
  const retired = all.filter((c) => c.deleted_at);

  const field = "rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100";

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <header className="mb-6">
        <Link href="/settings" className="text-xs text-zinc-500 hover:text-zinc-300">← Settings</Link>
        <h1 className="text-2xl font-semibold tracking-tight mt-2">Expense categories</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Categories used to tag bills + receipts. Retiring one hides it from new pickers but keeps it on past records.
        </p>
      </header>

      {/* Add */}
      <form action={createCategory} className="mb-6 flex flex-wrap items-end gap-2 rounded-lg border border-zinc-800 bg-zinc-950 p-4">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs uppercase tracking-wide text-zinc-500 mb-1">New category</label>
          <input name="name" type="text" required placeholder="e.g. Ammunition" className={`${field} w-full`} />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wide text-zinc-500 mb-1">Tax treatment</label>
          <select name="tax_treatment" defaultValue="deductible" className={field}>
            {TAX_TREATMENTS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <button type="submit" className="rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-white transition-colors">
          Add
        </button>
      </form>

      {/* Active */}
      <ul className="space-y-2">
        {active.map((c) => (
          <li key={c.id} className="rounded-md border border-zinc-800 bg-zinc-900/40 p-3">
            <form action={updateCategory} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="id" value={c.id} />
              <input name="name" defaultValue={c.name} className={`${field} flex-1 min-w-[160px]`} />
              <select name="tax_treatment" defaultValue={c.tax_treatment} className={field}>
                {TAX_TREATMENTS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <button type="submit" className="rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800 transition-colors">
                Save
              </button>
            </form>
            <form action={setDeleted} className="mt-1.5">
              <input type="hidden" name="id" value={c.id} />
              <input type="hidden" name="retire" value="true" />
              <button type="submit" className="text-[11px] text-zinc-500 hover:text-red-300">Retire</button>
            </form>
          </li>
        ))}
      </ul>

      {/* Retired */}
      {retired.length > 0 && (
        <div className="mt-8">
          <h2 className="text-xs uppercase tracking-wide text-zinc-500 mb-2">Retired</h2>
          <ul className="space-y-1.5">
            {retired.map((c) => (
              <li key={c.id} className="flex items-center justify-between rounded-md border border-zinc-800/60 bg-zinc-950 px-3 py-2">
                <span className="text-sm text-zinc-500">{c.name} <span className="text-[11px] text-zinc-600">· {taxLabel(c.tax_treatment)}</span></span>
                <form action={setDeleted}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="retire" value="false" />
                  <button type="submit" className="text-[11px] text-zinc-400 hover:text-zinc-200">Restore</button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
