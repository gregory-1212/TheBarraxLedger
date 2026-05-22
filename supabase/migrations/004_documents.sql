-- Migration 004: documents table + storage bucket + RLS
-- LED-34: Universal searchable document archive.
--
-- Every uploaded file across the Ledger (W-9s, compliance filings, contracts,
-- COIs, receipts) lands here. Each row references a Supabase Storage object
-- by storage_path, plus a polymorphic FK to whatever entity owns it.

CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_path text NOT NULL UNIQUE,
  original_filename text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  ocr_text tsvector,
  tags text[] NOT NULL DEFAULT '{}'::text[],
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  deleted_at timestamptz
);

CREATE INDEX documents_entity_idx
  ON public.documents (entity_type, entity_id)
  WHERE deleted_at IS NULL;

CREATE INDEX documents_ocr_idx
  ON public.documents
  USING GIN (ocr_text)
  WHERE deleted_at IS NULL;

CREATE INDEX documents_tags_idx
  ON public.documents
  USING GIN (tags)
  WHERE deleted_at IS NULL;

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY documents_staff_read ON public.documents
  FOR SELECT USING (public.is_staff());

CREATE POLICY documents_staff_insert ON public.documents
  FOR INSERT WITH CHECK (public.is_staff());

CREATE POLICY documents_staff_update ON public.documents
  FOR UPDATE USING (public.is_staff());

-- No DELETE policy: documents are soft-deleted via deleted_at only.

COMMENT ON TABLE public.documents IS
  'Universal archive for all uploaded files. entity_type+entity_id is the polymorphic FK to the owning record (vendor, compliance_item, receipt, etc.). OCR text populated lazily by a background job (Claude Vision).';

-- Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS — match table policies
CREATE POLICY documents_bucket_read ON storage.objects
  FOR SELECT USING (bucket_id = 'documents' AND public.is_staff());

CREATE POLICY documents_bucket_insert ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'documents' AND public.is_staff());

CREATE POLICY documents_bucket_update ON storage.objects
  FOR UPDATE USING (bucket_id = 'documents' AND public.is_staff());

CREATE POLICY documents_bucket_delete ON storage.objects
  FOR DELETE USING (bucket_id = 'documents' AND public.is_staff());
