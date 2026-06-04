-- Migration 013: bill_templates + recurring-bill generation (LED-20)
--
-- Recurring bills use REMINDER semantics by default (QBO pattern, per research/bills.md):
-- a daily cron creates a DRAFT bill from each due template; the user confirms it on review.
-- 'scheduled' mode (opt-in) auto-confirms to 'pending' instead. Lower-stakes than auto-pay.
--
-- The bills table (007) already reserved status='draft' and a source_template_id column for
-- this; we wire the FK now that bill_templates exists. Interval math lives in SQL.

CREATE TYPE auto_create_mode AS ENUM (
  'reminder',   -- generate a DRAFT bill; user must confirm (default, safest)
  'scheduled'   -- auto-confirm to 'pending' (opt-in)
);

CREATE TABLE public.bill_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE RESTRICT,
  expense_category_id uuid REFERENCES public.expense_categories(id) ON DELETE SET NULL,

  amount_cents int NOT NULL CHECK (amount_cents >= 0),   -- cents, matches bills
  payment_method text,
  reference text,
  notes text,

  -- Real Postgres interval: '1 month', '3 months', '1 year'.
  recurrence_interval interval NOT NULL,
  -- For monthly cadences: which day-of-month the generated bill is due (clamped to month length).
  recurrence_day_of_month int CHECK (recurrence_day_of_month BETWEEN 1 AND 31),

  -- When the cron should next generate an instance (set a few days before the due date).
  next_run_at timestamptz NOT NULL,

  auto_create_mode auto_create_mode NOT NULL DEFAULT 'reminder',
  active boolean NOT NULL DEFAULT true,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX bill_templates_due_idx
  ON public.bill_templates (next_run_at)
  WHERE active AND deleted_at IS NULL;

CREATE INDEX bill_templates_vendor_idx
  ON public.bill_templates (vendor_id)
  WHERE deleted_at IS NULL;

ALTER TABLE public.bill_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY bill_templates_staff_read ON public.bill_templates
  FOR SELECT USING (public.is_staff());
CREATE POLICY bill_templates_staff_insert ON public.bill_templates
  FOR INSERT WITH CHECK (public.is_staff());
CREATE POLICY bill_templates_staff_update ON public.bill_templates
  FOR UPDATE USING (public.is_staff());
-- No DELETE policy: soft-delete via deleted_at.

CREATE TRIGGER bill_templates_touch_updated_at
  BEFORE UPDATE ON public.bill_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Wire the provenance FK on bills.source_template_id (007 created the column without the
-- FK because this table didn't exist yet). Safe: all existing source_template_id are NULL.
ALTER TABLE public.bills
  ADD CONSTRAINT bills_source_template_fk
  FOREIGN KEY (source_template_id) REFERENCES public.bill_templates(id) ON DELETE SET NULL;

-- Data API grants (LED-60 convention). Staff-only table → NO anon grant.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bill_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bill_templates TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- run_recurring_bills(): the daily generator. Idempotent + atomic.
-- For each active template whose next_run_at <= now():
--   • compute the upcoming due_date from recurrence_day_of_month (clamped to month length),
--   • create the bill — DRAFT for 'reminder', PENDING for 'scheduled' — UNLESS one already
--     exists for (source_template_id, due_date); that dedup makes a same-day re-run a no-op,
--   • advance next_run_at by recurrence_interval.
-- Returns the rows generated, for the cron's diagnostics log.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.run_recurring_bills()
  RETURNS TABLE (out_bill_id uuid, out_template_id uuid, out_due_date date, out_amount_cents int, out_mode auto_create_mode)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  t public.bill_templates%ROWTYPE;
  v_month date;
  v_dom int;
  v_due date;
  v_status bill_status;
  v_new uuid;
BEGIN
  FOR t IN
    SELECT * FROM public.bill_templates
    WHERE active AND deleted_at IS NULL AND next_run_at <= now()
    ORDER BY next_run_at
  LOOP
    v_dom := COALESCE(t.recurrence_day_of_month, EXTRACT(DAY FROM t.next_run_at)::int);

    -- due date in the month next_run_at sits in, day clamped to that month's length
    v_month := date_trunc('month', t.next_run_at)::date;
    v_due := v_month + (LEAST(v_dom, EXTRACT(DAY FROM (v_month + interval '1 month' - interval '1 day'))::int) - 1);

    -- if that day already passed, roll forward one month
    IF v_due < CURRENT_DATE THEN
      v_month := (date_trunc('month', t.next_run_at) + interval '1 month')::date;
      v_due := v_month + (LEAST(v_dom, EXTRACT(DAY FROM (v_month + interval '1 month' - interval '1 day'))::int) - 1);
    END IF;

    -- idempotency: this template already produced a bill for this due_date → just advance.
    IF EXISTS (
      SELECT 1 FROM public.bills b
      WHERE b.source_template_id = t.id AND b.due_date = v_due AND b.deleted_at IS NULL
    ) THEN
      UPDATE public.bill_templates SET next_run_at = next_run_at + recurrence_interval WHERE id = t.id;
      CONTINUE;
    END IF;

    v_status := CASE WHEN t.auto_create_mode = 'scheduled' THEN 'pending'::bill_status ELSE 'draft'::bill_status END;

    INSERT INTO public.bills (vendor_id, expense_category_id, amount_cents, due_date,
                              payment_method, reference, notes, status, source_template_id)
    VALUES (t.vendor_id, t.expense_category_id, t.amount_cents, v_due,
            t.payment_method, t.reference, t.notes, v_status, t.id)
    RETURNING id INTO v_new;

    UPDATE public.bill_templates SET next_run_at = next_run_at + recurrence_interval WHERE id = t.id;

    out_bill_id := v_new;
    out_template_id := t.id;
    out_due_date := v_due;
    out_amount_cents := t.amount_cents;
    out_mode := t.auto_create_mode;
    RETURN NEXT;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.run_recurring_bills() TO service_role;

COMMENT ON TABLE public.bill_templates IS
  'Recurring-bill templates (LED-20). run_recurring_bills() generates draft (reminder) or pending (scheduled) bills from these on the daily cron. Amounts in cents.';
