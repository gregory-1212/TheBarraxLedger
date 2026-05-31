import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getSignedUrl } from "@/utils/documents";
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

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <Link href="/receipts" className="text-xs text-zinc-500 hover:text-zinc-300">← Receipts</Link>
      <ReceiptReview
        receipt={receipt as never}
        fileUrl={fileUrl}
        fileMime={fileMime}
        vendors={(vendors as { id: string; name: string }[] | null) ?? []}
        categories={(categories as { id: string; name: string }[] | null) ?? []}
      />
    </div>
  );
}
