-- Migration 011: form_1099_deliveries
-- LED-45: IRS requires payers to deliver 1099-NEC copies to recipients
-- by Jan 31. We need proof we sent them — per year, per contractor,
-- with method (email / mail / in_person) and the staff member who
-- recorded the delivery.
--
-- UNIQUE(tax_year, vendor_id) enforces "one delivery record per
-- contractor per year" — Mark Delivered is the operation, Edit replaces.

CREATE TYPE delivery_method AS ENUM ('email', 'mail', 'in_person');

CREATE TABLE public.form_1099_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_year int NOT NULL CHECK (tax_year >= 2000 AND tax_year <= 2100),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE RESTRICT,
  delivered_at timestamptz NOT NULL DEFAULT now(),
  delivered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  method delivery_method NOT NULL,
  notes text,

  UNIQUE (tax_year, vendor_id)
);

CREATE INDEX form_1099_deliveries_year_idx
  ON public.form_1099_deliveries (tax_year, delivered_at DESC);

CREATE INDEX form_1099_deliveries_vendor_idx
  ON public.form_1099_deliveries (vendor_id);

ALTER TABLE public.form_1099_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY form_1099_deliveries_staff_read ON public.form_1099_deliveries
  FOR SELECT USING (public.is_staff());

CREATE POLICY form_1099_deliveries_staff_insert ON public.form_1099_deliveries
  FOR INSERT WITH CHECK (public.is_staff());

CREATE POLICY form_1099_deliveries_staff_update ON public.form_1099_deliveries
  FOR UPDATE USING (public.is_staff());

CREATE POLICY form_1099_deliveries_staff_delete ON public.form_1099_deliveries
  FOR DELETE USING (public.is_staff());

COMMENT ON TABLE public.form_1099_deliveries IS
  'IRS Jan 31 1099-NEC delivery proof — one row per (year, vendor). Method covers email / mail / in_person; notes captures tracking numbers, recipient confirmations, etc. Audit log records every Mark Delivered action via FORM_1099_DELIVERED.';
