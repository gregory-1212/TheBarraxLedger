import { type NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/utils/supabase/server";
import { extractDocumentText, isSupportedOcrType } from "@/utils/ocr";

// LED-55: documents-archive OCR cron.
//
// Drains un-OCR'd documents through Claude Vision (utils/ocr.ts) and writes the
// transcription into documents.ocr_text (tsvector) so the search endpoint can
// find files by their content. Idempotent + bounded via the ocr_* columns added
// in migration 014.
//
// Per run: take up to MAX_PER_RUN documents that still need OCR (ocr_text IS NULL,
// status queued|failed, under the attempt cap), fetch each from Storage, OCR it,
// and mark it done | failed | skipped. A failed doc is retried on later runs until
// MAX_ATTEMPTS, after which it's left alone (don't re-bill a permanently-unreadable
// file forever). A daily cron = natural backoff between retries.
//
// Auth: Bearer CRON_SECRET when set (same convention as the reminders/recurring-bills
// crons). Service-role client bypasses RLS so the cron sees every document.
//
// Scheduled in vercel.json (11:00 UTC / ~6am CT daily). Migration 014 is run and
// ANTHROPIC_API_KEY + CRON_SECRET are set in the Ledger Vercel env (2026-06-04).

export const runtime = "nodejs";
export const maxDuration = 60; // a batch of sequential Vision calls can take a while

const MAX_PER_RUN = 10; // bound cost + execution time per invocation
const MAX_ATTEMPTS = 3; // give up after this many failures (then it needs manual attention)

type PendingDoc = {
  id: string;
  storage_path: string;
  mime_type: string;
  ocr_attempts: number;
};

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const got = request.headers.get("authorization");
    if (got !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("documents")
    .select("id, storage_path, mime_type, ocr_attempts")
    .is("deleted_at", null)
    .is("ocr_text", null)
    .in("ocr_status", ["queued", "failed"])
    .lt("ocr_attempts", MAX_ATTEMPTS)
    .order("uploaded_at", { ascending: true })
    .limit(MAX_PER_RUN);

  if (error) {
    console.error("[document-ocr] query failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const docs = (data ?? []) as PendingDoc[];
  if (docs.length === 0) {
    console.log("[document-ocr] nothing pending — all documents OCR'd.");
    return NextResponse.json({ ok: true, processed: 0 });
  }

  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  for (const doc of docs) {
    // File types we can't OCR (e.g. text/plain, .docx) → mark skipped so they
    // leave the work queue instead of being re-selected every run.
    if (!isSupportedOcrType(doc.mime_type)) {
      await supabase
        .from("documents")
        .update({
          ocr_status: "skipped",
          ocr_error: `unsupported mime type: ${doc.mime_type}`,
          ocr_attempts: doc.ocr_attempts + 1,
          ocr_processed_at: new Date().toISOString(),
        })
        .eq("id", doc.id);
      skipped++;
      continue;
    }

    const { data: blob, error: dlErr } = await supabase.storage
      .from("documents")
      .download(doc.storage_path);
    if (dlErr || !blob) {
      console.error(`[document-ocr] download failed for ${doc.id}: ${dlErr?.message ?? "no blob"}`);
      await supabase
        .from("documents")
        .update({
          ocr_status: "failed",
          ocr_error: `download failed: ${dlErr?.message ?? "no blob"}`,
          ocr_attempts: doc.ocr_attempts + 1,
          ocr_processed_at: new Date().toISOString(),
        })
        .eq("id", doc.id);
      failed++;
      continue;
    }

    const base64 = Buffer.from(await blob.arrayBuffer()).toString("base64");
    const ocr = await extractDocumentText(base64, doc.mime_type);

    if (ocr.ok) {
      const { error: rpcErr } = await supabase.rpc("set_document_ocr", {
        p_id: doc.id,
        p_text: ocr.data,
      });
      if (rpcErr) {
        console.error(`[document-ocr] set_document_ocr failed for ${doc.id}: ${rpcErr.message}`);
        await supabase
          .from("documents")
          .update({
            ocr_status: "failed",
            ocr_error: `write failed: ${rpcErr.message}`,
            ocr_attempts: doc.ocr_attempts + 1,
            ocr_processed_at: new Date().toISOString(),
          })
          .eq("id", doc.id);
        failed++;
      } else {
        succeeded++;
      }
      continue;
    }

    // Not ok: either a global "no API key" skip or a real failure.
    if (ocr.skipped) {
      // The only skip extractDocumentText emits is a missing ANTHROPIC_API_KEY —
      // a run-wide condition, not a per-document one. Bail without burning attempts
      // so every doc is still queued once the key lands in Vercel.
      console.warn(`[document-ocr] ${ocr.reason} — aborting run, no documents touched.`);
      return NextResponse.json({ ok: true, skipped: true, reason: ocr.reason, processed: succeeded });
    }

    console.error(`[document-ocr] OCR failed for ${doc.id}: ${ocr.error}`);
    await supabase
      .from("documents")
      .update({
        ocr_status: "failed",
        ocr_error: ocr.error,
        ocr_attempts: doc.ocr_attempts + 1,
        ocr_processed_at: new Date().toISOString(),
      })
      .eq("id", doc.id);
    failed++;
  }

  console.log(`[document-ocr] processed ${docs.length}: ${succeeded} ok, ${failed} failed, ${skipped} skipped.`);
  return NextResponse.json({ ok: true, processed: docs.length, succeeded, failed, skipped });
}
