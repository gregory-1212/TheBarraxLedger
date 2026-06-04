-- Migration 014: OCR tracking on the documents archive (LED-55)
--
-- documents.ocr_text (tsvector) already exists and the search endpoint queries
-- it, but nothing populates it. The /api/cron/document-ocr job (LED-55) drains
-- un-OCR'd documents through Claude Vision (utils/ocr.ts extractDocumentText).
--
-- These columns make that job idempotent + bounded (mirrors the receipts table):
--   ocr_status    queued → done | failed | skipped
--   ocr_attempts  retry counter so a permanently-unreadable file isn't re-billed forever
--   ocr_error     last error, for diagnostics
--   ocr_processed_at  when OCR last ran
--
-- documents is a pre-2026-10-30 table (grandfathered) so ALTER needs no GRANT block.
-- Existing rows default to 'queued' → the cron backfills them on its next runs.

CREATE TYPE document_ocr_status AS ENUM ('queued', 'done', 'failed', 'skipped');

ALTER TABLE public.documents
  ADD COLUMN ocr_status       document_ocr_status NOT NULL DEFAULT 'queued',
  ADD COLUMN ocr_attempts     int NOT NULL DEFAULT 0,
  ADD COLUMN ocr_error        text,
  ADD COLUMN ocr_processed_at timestamptz;

-- Partial index: the cron's work-queue lookup ("docs still needing OCR").
CREATE INDEX documents_ocr_pending_idx
  ON public.documents (uploaded_at)
  WHERE deleted_at IS NULL AND ocr_text IS NULL
    AND ocr_status IN ('queued', 'failed');

-- Atomic "OCR succeeded" write. The cron can't set a tsvector via supabase-js,
-- so it calls this: text → to_tsvector('english', ...) + mark done in one statement.
-- security definer + locked search_path is the house pattern for DB-side functions.
CREATE OR REPLACE FUNCTION public.set_document_ocr(p_id uuid, p_text text)
  RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = public
AS $$
  UPDATE public.documents
     SET ocr_text         = to_tsvector('english', coalesce(p_text, '')),
         ocr_status       = 'done',
         ocr_error        = null,
         ocr_attempts     = ocr_attempts + 1,
         ocr_processed_at = now()
   WHERE id = p_id;
$$;

REVOKE ALL ON FUNCTION public.set_document_ocr(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.set_document_ocr(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_document_ocr(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.set_document_ocr(uuid, text) IS
  'LED-55: write OCR plain text as an english tsvector into documents.ocr_text and mark the row done. Called by the document-ocr cron via rpc.';
