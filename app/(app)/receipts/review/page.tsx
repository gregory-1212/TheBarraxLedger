import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { createInlineSignedUrls } from "@/utils/documents";
import ReviewList from "./ReviewList";

// LED-48: batch review. Lists every pending receipt as a recap card so staff can
// Approve straight from the overview, and only tap into one to fix something off.
// Approve reuses the hardened confirm endpoint (total+date required, idempotent).

const MAX = 50; // cap the load; a backlog beyond this drains as earlier ones clear

type RawReceipt = {
  id: string;
  vendor_id: string | null;
  expense_category_id: string | null;
  receipt_date: string | null;
  total_cents: number | null;
  ocr_status: string;
  ocr_data: { vendorName?: string | null; confidence?: Record<string, number> } | null;
  vendor: { name: string } | null;
  expense_category: { name: string } | null;
};

export default async function ReceiptsReviewPage() {
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("receipts")
    .select(
      "id, vendor_id, expense_category_id, receipt_date, total_cents, ocr_status, ocr_data, vendor:vendors(name), expense_category:expense_categories(name)",
    )
    .eq("status", "pending")
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(MAX);

  const receipts = (rows as unknown as RawReceipt[] | null) ?? [];

  // Thumbnails: latest document per receipt, batch-signed inline (no audit spam).
  const thumbs = new Map<string, string>();
  if (receipts.length > 0) {
    const { data: docs } = await supabase
      .from("documents")
      .select("id, entity_id, uploaded_at")
      .eq("entity_type", "receipt")
      .in("entity_id", receipts.map((r) => r.id))
      .is("deleted_at", null)
      .order("uploaded_at", { ascending: false });

    const docByReceipt = new Map<string, string>();
    for (const d of (docs ?? []) as { id: string; entity_id: string }[]) {
      if (!docByReceipt.has(d.entity_id)) docByReceipt.set(d.entity_id, d.id);
    }
    const urlByDoc = await createInlineSignedUrls([...docByReceipt.values()], 900);
    for (const [receiptId, docId] of docByReceipt) {
      const url = urlByDoc.get(docId);
      if (url) thumbs.set(receiptId, url);
    }
  }

  // Possible-duplicate flag. A receipt is flagged when another non-deleted receipt
  // shares the same AMOUNT and either (a) the same date (vendors not clearly
  // different) or (b) the same vendor — the latter catches a re-scan of the same
  // receipt even when OCR reads the date slightly differently. Candidates are
  // bounded to receipts with a matching amount. Heads-up only, never a block.
  const totals = [...new Set(receipts.map((r) => r.total_cents).filter((v): v is number => v != null))];
  let candidates: { id: string; total_cents: number | null; receipt_date: string | null; vendor_id: string | null; status: string }[] = [];
  if (totals.length > 0) {
    const { data } = await supabase
      .from("receipts")
      .select("id, total_cents, receipt_date, vendor_id, status")
      .is("deleted_at", null)
      .in("total_cents", totals);
    candidates = (data as typeof candidates | null) ?? [];
  }

  function duplicateNote(r: RawReceipt): string | null {
    if (r.total_cents == null) return null;
    for (const c of candidates) {
      if (c.id === r.id || c.total_cents !== r.total_cents) continue;
      const sameDate = !!r.receipt_date && c.receipt_date === r.receipt_date;
      const clearlyDiffVendor = !!(r.vendor_id && c.vendor_id && r.vendor_id !== c.vendor_id);
      const sameVendor = !!(r.vendor_id && c.vendor_id && r.vendor_id === c.vendor_id);
      const where = c.status === "confirmed" ? "a receipt already in your books" : "another receipt here";
      if (sameDate && !clearlyDiffVendor) return `Same date & amount as ${where}`;
      if (sameVendor) return `Same vendor & amount as ${where}`;
    }
    return null;
  }

  const items = receipts.map((r) => {
    const conf = (r.ocr_data?.confidence ?? {}) as Record<string, number>;
    // "check this" flag: a key money field the AI read but with low confidence.
    const lowConfidence = ["total_cents", "date"].some((k) => {
      const c = conf[k] ?? 0;
      return c > 0 && c < 0.6;
    });
    return {
      id: r.id,
      vendorName: r.vendor?.name ?? null,
      ocrVendor: r.ocr_data?.vendorName ?? null,
      categoryName: r.expense_category?.name ?? null,
      date: r.receipt_date,
      totalCents: r.total_cents,
      lowConfidence,
      ocrFailed: r.ocr_status === "failed" || r.ocr_status === "skipped",
      thumbUrl: thumbs.get(r.id) ?? null,
      canApprove: r.total_cents != null && !!r.receipt_date,
      possibleDuplicate: duplicateNote(r),
    };
  });

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      <header className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Review Receipts</h1>
          <p className="text-sm text-zinc-400 mt-1">
            {items.length === 0
              ? "Nothing waiting to review."
              : `${items.length} waiting. Approve the ones that look right; tap a card to fix anything off.`}
          </p>
        </div>
        <Link
          href="/receipts/capture"
          className="shrink-0 rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-900 transition-colors"
        >
          + Add more
        </Link>
      </header>

      <ReviewList items={items} />
    </div>
  );
}
