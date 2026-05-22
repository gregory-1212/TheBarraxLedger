-- Migration 005: compliance_items + compliance_item_history
-- LED-5: Core schema for Compliance V1.
--
-- Design notes (per research/compliance.md):
--   cadence is `interval` (e.g. '3 years' for FFL, '1 month' for sales tax),
--   NOT a boolean annual flag. last_filed_date + cadence_interval auto-fills
--   next_due_date via trigger when a filing is recorded.
--
-- Attachments route through the universal `documents` table (LED-34) with
-- entity_type='compliance_item'. No per-row attachment_url column.

CREATE TYPE compliance_category AS ENUM (
  'federal',
  'state',
  'local',
  'tax',
  'insurance'
);

CREATE TYPE compliance_jurisdiction AS ENUM (
  'NV',
  'TN',
  'FED',
  'DAVIDSON_COUNTY',
  'CITY_OF_NASHVILLE'
);

CREATE TYPE compliance_type AS ENUM (
  'annual_list',
  'annual_report',
  'registered_agent_renewal',
  'member_meeting',
  'business_license',
  'sales_tax',
  'ffl_renewal',
  'insurance_renewal',
  'other'
);

CREATE TYPE compliance_status AS ENUM (
  'pending',
  'in_progress',
  'done',
  'overdue'
);

-- Generic trigger function for keeping updated_at fresh. Will be reused by
-- other tables; defined here in the first migration that needs it.
CREATE OR REPLACE FUNCTION public.touch_updated_at()
  RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.compliance_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category compliance_category NOT NULL,
  jurisdiction compliance_jurisdiction NOT NULL,
  compliance_type compliance_type NOT NULL,
  cadence_interval interval,           -- NULL for one-time obligations
  last_filed_date date,                -- NULL until first filing recorded
  next_due_date date NOT NULL,         -- manually set on create; trigger updates on file
  status compliance_status NOT NULL DEFAULT 'pending',
  completed_at timestamptz,
  cost_cents int,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX compliance_items_due_idx
  ON public.compliance_items (next_due_date)
  WHERE deleted_at IS NULL;

CREATE INDEX compliance_items_jurisdiction_idx
  ON public.compliance_items (jurisdiction)
  WHERE deleted_at IS NULL;

CREATE INDEX compliance_items_status_idx
  ON public.compliance_items (status)
  WHERE deleted_at IS NULL;

ALTER TABLE public.compliance_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY compliance_items_staff_read ON public.compliance_items
  FOR SELECT USING (public.is_staff());

CREATE POLICY compliance_items_staff_insert ON public.compliance_items
  FOR INSERT WITH CHECK (public.is_staff());

CREATE POLICY compliance_items_staff_update ON public.compliance_items
  FOR UPDATE USING (public.is_staff());

-- No DELETE policy: soft-delete via deleted_at only.

CREATE TRIGGER compliance_items_touch_updated_at
  BEFORE UPDATE ON public.compliance_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Recompute next_due_date when last_filed_date changes (the "mark filed" flow).
-- Skips if cadence_interval is NULL (one-time obligation).
CREATE OR REPLACE FUNCTION public.compliance_items_compute_next_due()
  RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.last_filed_date IS DISTINCT FROM OLD.last_filed_date
     AND NEW.last_filed_date IS NOT NULL
     AND NEW.cadence_interval IS NOT NULL THEN
    NEW.next_due_date := NEW.last_filed_date + NEW.cadence_interval;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER compliance_items_recompute_next_due
  BEFORE UPDATE ON public.compliance_items
  FOR EACH ROW EXECUTE FUNCTION public.compliance_items_compute_next_due();

-- Audit trail for status changes, filings, attachments.
-- Distinct from audit_log: this is the user-visible "history" view on the
-- detail page (LED-8 activity feed). audit_log is for security/compliance.
CREATE TABLE public.compliance_item_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  compliance_item_id uuid NOT NULL REFERENCES public.compliance_items(id) ON DELETE CASCADE,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text NOT NULL,
  event_type text NOT NULL,            -- 'created' | 'status_changed' | 'filed' | 'noted' | 'document_attached' | 'document_removed'
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX compliance_item_history_item_idx
  ON public.compliance_item_history (compliance_item_id, occurred_at DESC);

ALTER TABLE public.compliance_item_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY compliance_item_history_staff_read ON public.compliance_item_history
  FOR SELECT USING (public.is_staff());

CREATE POLICY compliance_item_history_staff_insert ON public.compliance_item_history
  FOR INSERT WITH CHECK (public.is_staff());

COMMENT ON TABLE public.compliance_items IS
  'One row per LLC compliance obligation (filing, renewal, meeting, license). Cadence is an interval; trigger auto-fills next_due_date when last_filed_date is updated.';

COMMENT ON TABLE public.compliance_item_history IS
  'User-visible activity feed for a compliance item: created/filed/noted/document_attached events. Separate from audit_log which is for security.';
