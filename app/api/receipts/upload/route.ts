import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { uploadDocument } from "@/utils/documents";
import { logAudit, AUDIT_ACTIONS } from "@/utils/audit-log";
import { extractReceiptData, isSupportedOcrType } from "@/utils/ocr";

// LED-22/23: POST /api/receipts/upload (multipart/form-data: file, notes?)
//
// Staff-only (RLS). Stores the file in the universal documents archive
// (entity_type='receipt'), creates a receipts row, and runs OCR inline so the
// uploader sees the extraction immediately. OCR failures are non-fatal — the
// receipt is still saved (ocr_status=failed) and can be re-extracted or filled
// in by hand on the review page.

const MAX_BYTES = 20 * 1024 * 1024; // 20MB
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "expected multipart/form-data" }, { status: 400 });
  }

  const file = form.get("file");
  const notesRaw = form.get("notes");
  const notes = typeof notesRaw === "string" && notesRaw.trim() ? notesRaw.trim() : null;

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "A receipt file is required." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 20MB)." }, { status: 413 });
  }
  if (!isSupportedOcrType(file.type)) {
    return NextResponse.json(
      { error: `Unsupported file type${file.type ? ` (${file.type})` : ""}. Use JPG, PNG, WEBP, GIF, or PDF.` },
      { status: 400 },
    );
  }

  // 1) Create the receipt row first — we need its id as the document's entity_id.
  const { data: receipt, error: insErr } = await supabase
    .from("receipts")
    .insert({ status: "pending", ocr_status: "queued", uploaded_by: user.id, notes })
    .select("id")
    .single();
  if (insErr || !receipt) {
    return NextResponse.json({ error: `Could not create receipt: ${insErr?.message ?? "unknown"}` }, { status: 500 });
  }

  // 2) Store the file in the universal documents archive.
  const bytes = await file.arrayBuffer();
  try {
    await uploadDocument({
      body: bytes,
      filename: file.name || "receipt",
      mimeType: file.type,
      entityType: "receipt",
      entityId: receipt.id,
      sizeBytes: file.size,
      tags: ["receipt"],
    });
  } catch (e) {
    // Roll back the now-orphaned receipt row so it doesn't linger.
    await supabase.from("receipts").update({ deleted_at: new Date().toISOString() }).eq("id", receipt.id);
    return NextResponse.json({ error: `File upload failed: ${(e as Error).message}` }, { status: 500 });
  }

  // 3) Inline OCR — non-fatal. Pre-fills the review fields.
  const base64 = Buffer.from(bytes).toString("base64");
  const ocr = await extractReceiptData(base64, file.type);

  const patch: Record<string, unknown> = { ocr_attempts: 1 };
  if (ocr.ok) {
    const d = ocr.data;
    patch.ocr_data = d;
    patch.ocr_status = "done";
    patch.receipt_date = d.date && ISO_DATE.test(d.date) ? d.date : null;
    patch.total_cents = d.totalCents;
    patch.tax_cents = d.taxCents;
    patch.payment_method = d.paymentMethod;
  } else if (ocr.skipped) {
    patch.ocr_status = "skipped";
    patch.ocr_error = ocr.reason;
  } else {
    patch.ocr_status = "failed";
    patch.ocr_error = ocr.error;
  }
  await supabase.from("receipts").update(patch).eq("id", receipt.id);

  // Audit (logAudit throws on failure; the receipt + file are already saved, so
  // swallow a logging failure rather than 500 a successful upload).
  try {
    await logAudit({ action: AUDIT_ACTIONS.RECEIPT_UPLOADED, entityType: "receipt", entityId: receipt.id });
  } catch (e) {
    console.error("[receipts/upload] audit log failed:", (e as Error).message);
  }

  return NextResponse.json({
    id: receipt.id,
    ocrStatus: patch.ocr_status ?? "queued",
    ocrData: ocr.ok ? ocr.data : null,
    ocrError: ocr.ok ? null : (ocr.skipped ? ocr.reason : ocr.error),
  });
}
