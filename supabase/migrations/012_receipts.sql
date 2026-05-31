-- Migration 012: receipts (OCR-extracted receipt records)
-- LED-22/23/24/25.
--
-- The uploaded FILE lives in the universal documents archive
-- (entity_type='receipt', entity_id=receipts.id) — same pattern bills/vendors
-- use, so there is NO dedicated receipts bucket. This table holds the
-- structured OCR extraction (utils/ocr.ts ReceiptExtraction) plus the user's
-- confirmed vendor / category / amounts. One row = one receipt photo/upload.
--
-- v1 is manual-review: OCR pre-fills the fields, staff confirm. Auto-confirm
-- thresholds (LED-48) and cron OCR retry (LED-55) are a later phase.

CREATE TYPE receipt_status AS ENUM ('pending', 'confirmed');
CREATE TYPE receipt_ocr_status AS ENUM ('queued', 'done', 'failed', 'skipped');

CREATE TABLE public.receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Set by the user on confirm (OCR suggests, staff picks). Match bills' FKs.
  vendor_id           uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  expense_category_id uuid REFERENCES public.expense_categories(id) ON DELETE SET NULL,

  -- Optional link to a bill this receipt documents.
  bill_id uuid REFERENCES public.bills(id) ON DELETE SET NULL,

  status receipt_status NOT NULL DEFAULT 'pending',

  -- Full Claude Vision extraction (ReceiptExtraction): vendorName, date,
  -- totalCents, taxCents, paymentMethod, lineItems, confidence, raw.
  ocr_data     jsonb,
  ocr_status   receipt_ocr_status NOT NULL DEFAULT 'queued',
  ocr_error    text,
  ocr_attempts int NOT NULL DEFAULT 0,

  -- Denormalized from ocr_data (or user-corrected) for indexing/reporting.
  -- Money in cents, matching the Ledger convention.
  receipt_date   date,
  total_cents    int CHECK (total_cents IS NULL OR total_cents >= 0),
  tax_cents      int CHECK (tax_cents IS NULL OR tax_cents >= 0),
  payment_method text,

  notes text,

  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

CREATE INDEX receipts_status_idx      ON public.receipts (status)        WHERE deleted_at IS NULL;
CREATE INDEX receipts_ocr_status_idx  ON public.receipts (ocr_status)    WHERE deleted_at IS NULL;
CREATE INDEX receipts_vendor_idx      ON public.receipts (vendor_id)     WHERE deleted_at IS NULL;
CREATE INDEX receipts_date_idx        ON public.receipts (receipt_date)  WHERE deleted_at IS NULL;
CREATE INDEX receipts_created_at_idx  ON public.receipts (created_at DESC) WHERE deleted_at IS NULL;

ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY receipts_staff_read   ON public.receipts FOR SELECT USING (public.is_staff());
CREATE POLICY receipts_staff_insert ON public.receipts FOR INSERT WITH CHECK (public.is_staff());
CREATE POLICY receipts_staff_update ON public.receipts FOR UPDATE USING (public.is_staff());
-- No DELETE policy: soft-delete via deleted_at only.

CREATE TRIGGER receipts_touch_updated_at
  BEFORE UPDATE ON public.receipts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

COMMENT ON TABLE public.receipts IS
  'OCR-extracted receipt records (LED-22/23/24/25). The file lives in documents (entity_type=receipt, entity_id=receipts.id). ocr_data = full Claude Vision ReceiptExtraction; v1 is manual-review (staff confirm). Amounts in cents.';
