import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { logAudit, AUDIT_ACTIONS } from "@/utils/audit-log";
import { extractReceiptData, isSupportedOcrType } from "@/utils/ocr";

// LED-23/25: POST /api/receipts/<id>/ocr
//   { action: "re_extract" }                       — re-run OCR on the stored file
//   { action: "confirm", overrides: {...} }        — save reviewed fields + mark confirmed
//
// Staff-only (RLS). The file lives in the documents archive
// (entity_type='receipt', entity_id=<id>).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}
function nonNegIntOrNull(v: unknown): number | null | undefined {
  if (v === null) return null;
  if (typeof v === "number" && Number.isInteger(v) && v >= 0) return v;
  return undefined; // invalid → skip (don't write)
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "invalid receipt id" }, { status: 400 });

  const body = await request.json().catch(() => ({} as any));
  const action = body?.action;

  const { data: receipt } = await supabase
    .from("receipts").select("id, ocr_attempts").eq("id", id).is("deleted_at", null).maybeSingle();
  if (!receipt) return NextResponse.json({ error: "receipt not found" }, { status: 404 });

  // ── Re-run OCR on the stored file ──
  if (action === "re_extract") {
    const { data: doc } = await supabase
      .from("documents")
      .select("storage_path, mime_type")
      .eq("entity_type", "receipt").eq("entity_id", id).is("deleted_at", null)
      .order("uploaded_at", { ascending: false }).limit(1).maybeSingle();
    if (!doc) return NextResponse.json({ error: "no file on this receipt" }, { status: 404 });
    if (!isSupportedOcrType(doc.mime_type)) {
      return NextResponse.json({ error: "stored file type can't be OCR'd" }, { status: 400 });
    }
    const { data: blob, error: dlErr } = await supabase.storage.from("documents").download(doc.storage_path);
    if (dlErr || !blob) return NextResponse.json({ error: "could not read the stored file" }, { status: 500 });

    const base64 = Buffer.from(await blob.arrayBuffer()).toString("base64");
    const ocr = await extractReceiptData(base64, doc.mime_type);

    const patch: Record<string, unknown> = { ocr_attempts: (receipt.ocr_attempts ?? 0) + 1 };
    if (ocr.ok) {
      const d = ocr.data;
      patch.ocr_data = d;
      patch.ocr_status = "done";
      patch.ocr_error = null;
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
    const { data: updated, error: upErr } = await supabase
      .from("receipts").update(patch).eq("id", id).select("*").single();
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    return NextResponse.json({ receipt: updated, ocrData: ocr.ok ? ocr.data : null });
  }

  // ── Save reviewed fields + mark confirmed ──
  if (action === "confirm") {
    const o = (body?.overrides ?? {}) as Record<string, unknown>;
    const patch: Record<string, unknown> = { status: "confirmed" };

    if ("vendorId" in o) {
      if (o.vendorId !== null && !isUuid(o.vendorId)) return NextResponse.json({ error: "invalid vendorId" }, { status: 400 });
      patch.vendor_id = o.vendorId;
    }
    if ("expenseCategoryId" in o) {
      if (o.expenseCategoryId !== null && !isUuid(o.expenseCategoryId)) return NextResponse.json({ error: "invalid expenseCategoryId" }, { status: 400 });
      patch.expense_category_id = o.expenseCategoryId;
    }
    if ("billId" in o) {
      if (o.billId !== null && !isUuid(o.billId)) return NextResponse.json({ error: "invalid billId" }, { status: 400 });
      patch.bill_id = o.billId;
    }
    const total = nonNegIntOrNull(o.totalCents);
    if (total !== undefined) patch.total_cents = total;
    const tax = nonNegIntOrNull(o.taxCents);
    if (tax !== undefined) patch.tax_cents = tax;
    if ("receiptDate" in o) {
      if (o.receiptDate !== null && !(typeof o.receiptDate === "string" && ISO_DATE.test(o.receiptDate))) {
        return NextResponse.json({ error: "receiptDate must be YYYY-MM-DD" }, { status: 400 });
      }
      patch.receipt_date = o.receiptDate;
    }
    if ("paymentMethod" in o) patch.payment_method = typeof o.paymentMethod === "string" ? o.paymentMethod : null;
    if ("notes" in o) patch.notes = typeof o.notes === "string" ? o.notes : null;

    const { data: updated, error: upErr } = await supabase
      .from("receipts").update(patch).eq("id", id).select("*").single();
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    try {
      await logAudit({ action: AUDIT_ACTIONS.RECEIPT_CONFIRMED, entityType: "receipt", entityId: id });
    } catch (e) {
      console.error("[receipts/ocr] audit log failed:", (e as Error).message);
    }
    return NextResponse.json({ receipt: updated });
  }

  return NextResponse.json({ error: "unknown action (expected re_extract | confirm)" }, { status: 400 });
}
