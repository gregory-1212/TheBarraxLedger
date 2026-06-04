import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getSignedUrl } from "@/utils/documents";
import { findSimilarVendors } from "@/utils/find-similar-vendors";
import ReceiptReview from "./ReceiptReview";

// LED-25: Receipt detail + review/confirm. Server-fetches the receipt, a signed
// URL for the stored image/PDF, and the vendor + category pick-lists, then hands
// off to the client review form.

export default async function ReceiptDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: receipt } = await supabase
    .from("receipts").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
  if (!receipt) notFound();

  const { data: doc } = await supabase
    .from("documents")
    .select("id, mime_type")
    .eq("entity_type", "receipt").eq("entity_id", id).is("deleted_at", null)
    .order("uploaded_at", { ascending: false }).limit(1).maybeSingle();

  let fileUrl: string | null = null;
  let fileMime: string | null = null;
  if (doc) {
    try {
      fileUrl = await getSignedUrl(doc.id, 600);
      fileMime = doc.mime_type as string;
    } catch {
      fileUrl = null;
    }
  }

  const [{ data: vendors }, { data: categories }] = await Promise.all([
    supabase.from("vendors").select("id, name").is("deleted_at", null).order("name", { ascending: true }),
    supabase.from("expense_categories").select("id, name").is("deleted_at", null).order("sort_order", { ascending: true }),
  ]);

  // Possible-duplicate flag (same heuristic as the batch review): another
  // non-deleted receipt with the same total + date, vendor not clearly different.
  let possibleDuplicate: string | null = null;
  if (receipt.total_cents != null) {
    const { data: dups } = await supabase
      .from("receipts")
      .select("id, vendor_id, receipt_date, status")
      .eq("total_cents", receipt.total_cents)
      .is("deleted_at", null)
      .neq("id", receipt.id);
    for (const d of ((dups as { id: string; vendor_id: string | null; receipt_date: string | null; status: string }[] | null) ?? [])) {
      const sameDate = !!receipt.receipt_date && d.receipt_date === receipt.receipt_date;
      const clearlyDiffVendor = !!(receipt.vendor_id && d.vendor_id && receipt.vendor_id !== d.vendor_id);
      const sameVendor = !!(receipt.vendor_id && d.vendor_id && receipt.vendor_id === d.vendor_id);
      const where = d.status === "confirmed" ? "a receipt already in your books" : "another receipt";
      if (sameDate && !clearlyDiffVendor) { possibleDuplicate = `Same date & amount as ${where}`; break; }
      if (sameVendor) { possibleDuplicate = `Same vendor & amount as ${where}`; break; }
    }
  }

  // If unassigned but OCR read a vendor name that matches an existing vendor,
  // suggest selecting it (so we don't prompt to create a duplicate vendor).
  let suggestedVendor: { id: string; name: string } | null = null;
  const ocrVendorName = (receipt.ocr_data as { vendorName?: string | null } | null)?.vendorName ?? null;
  if (!receipt.vendor_id && ocrVendorName) {
    try {
      const matches = await findSimilarVendors(supabase, ocrVendorName, { threshold: 0.5, maxResults: 1 });
      if (matches.length > 0) suggestedVendor = { id: matches[0].vendor_id, name: matches[0].name };
    } catch {
      /* suggestion is best-effort */
    }
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <Link href="/receipts" className="text-xs text-zinc-500 hover:text-zinc-300">← Receipts</Link>
      <ReceiptReview
        receipt={receipt as never}
        fileUrl={fileUrl}
        fileMime={fileMime}
        vendors={(vendors as { id: string; name: string }[] | null) ?? []}
        categories={(categories as { id: string; name: string }[] | null) ?? []}
        possibleDuplicate={possibleDuplicate}
        suggestedVendor={suggestedVendor}
      />
    </div>
  );
}
