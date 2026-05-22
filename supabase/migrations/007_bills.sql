-- Migration 007: expense_categories + bills
-- LED-17: Bills + categories. Refined per research/bills.md:
--   - Categories are a FLAT list (no nesting). Seeded with the standard set.
--   - Bills are one-off here; recurring lives in bill_templates (LED-20).
--   - Receipts attach via the universal documents table (LED-34), so the
--     "receipt_url" column from the original spec becomes receipt_document_id.

CREATE TYPE tax_treatment AS ENUM (
  'deductible',
  'non_deductible',
  'capital_expense'
);

CREATE TYPE bill_status AS ENUM (
  'draft',           -- created by recurring-bill cron, awaiting user confirm (LED-20)
  'pending',         -- confirmed, due in the future
  'paid',
  'overdue',
  'void'
);

CREATE TABLE public.expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  tax_treatment tax_treatment NOT NULL DEFAULT 'deductible',
  notes text,
  sort_order int NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX expense_categories_active_idx
  ON public.expense_categories (sort_order, name)
  WHERE deleted_at IS NULL;

ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY expense_categories_staff_read ON public.expense_categories
  FOR SELECT USING (public.is_staff());

CREATE POLICY expense_categories_staff_insert ON public.expense_categories
  FOR INSERT WITH CHECK (public.is_staff());

CREATE POLICY expense_categories_staff_update ON public.expense_categories
  FOR UPDATE USING (public.is_staff());

-- Seed: standard categories. Greg/Julie can edit tax_treatment + add custom
-- categories via the Settings UI later. Sort order roughly matches frequency.
INSERT INTO public.expense_categories (name, tax_treatment, sort_order) VALUES
  ('Rent',                        'deductible',      10),
  ('Utilities',                   'deductible',      20),
  ('Internet & Phone',            'deductible',      30),
  ('Software / SaaS',             'deductible',      40),
  ('Insurance',                   'deductible',      50),
  ('Professional Services',       'deductible',      60),
  ('Marketing & Advertising',     'deductible',      70),
  ('Range Supplies',              'deductible',      80),
  ('Office Supplies',             'deductible',      90),
  ('Equipment',                   'capital_expense', 100),
  ('Contractor Pay',              'deductible',      110),
  ('Taxes & Fees',                'deductible',      120),
  ('Repairs & Maintenance',       'deductible',      130),
  ('Travel',                      'deductible',      140),
  ('Meals',                       'deductible',      150),
  ('Other',                       'deductible',      900);

CREATE TABLE public.bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE RESTRICT,
  expense_category_id uuid REFERENCES public.expense_categories(id) ON DELETE SET NULL,

  -- Money math: cents only. Match CRM convention.
  amount_cents int NOT NULL CHECK (amount_cents >= 0),

  due_date date NOT NULL,
  paid_date date,
  amount_paid_cents int CHECK (amount_paid_cents >= 0),       -- supports partial payments

  payment_method text,

  status bill_status NOT NULL DEFAULT 'pending',

  -- Receipt attachment routes through the universal documents archive.
  receipt_document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,

  -- Free-form reference (invoice #, internal note, etc.)
  reference text,
  notes text,

  -- Provenance: which bill_template generated this (NULL for one-off bills).
  -- The bill_templates table itself lands in LED-20.
  source_template_id uuid,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX bills_due_date_idx
  ON public.bills (due_date)
  WHERE deleted_at IS NULL;

CREATE INDEX bills_vendor_idx
  ON public.bills (vendor_id)
  WHERE deleted_at IS NULL;

CREATE INDEX bills_status_idx
  ON public.bills (status)
  WHERE deleted_at IS NULL;

CREATE INDEX bills_unpaid_due_idx
  ON public.bills (due_date)
  WHERE deleted_at IS NULL AND paid_date IS NULL;

CREATE INDEX bills_paid_date_idx
  ON public.bills (paid_date)
  WHERE deleted_at IS NULL AND paid_date IS NOT NULL;

ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;

CREATE POLICY bills_staff_read ON public.bills
  FOR SELECT USING (public.is_staff());

CREATE POLICY bills_staff_insert ON public.bills
  FOR INSERT WITH CHECK (public.is_staff());

CREATE POLICY bills_staff_update ON public.bills
  FOR UPDATE USING (public.is_staff());

-- No DELETE policy: soft-delete via deleted_at only.

CREATE TRIGGER bills_touch_updated_at
  BEFORE UPDATE ON public.bills
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Auto-flip status to overdue when due_date passes without a paid_date.
-- A nightly cron would also work, but doing it on read keeps things simple.
-- We keep this as a trigger-on-update so a stale "pending" status auto-corrects
-- the next time the row is touched. The query layer handles the "view-time"
-- case (compute status_effective = CASE WHEN due_date < today AND paid_date IS
-- NULL THEN 'overdue' ELSE status END).

CREATE OR REPLACE FUNCTION public.bills_auto_status()
  RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.paid_date IS NOT NULL AND NEW.status NOT IN ('paid', 'void') THEN
    NEW.status := 'paid';
  ELSIF NEW.paid_date IS NULL
        AND NEW.due_date < CURRENT_DATE
        AND NEW.status = 'pending' THEN
    NEW.status := 'overdue';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER bills_auto_status_trg
  BEFORE INSERT OR UPDATE ON public.bills
  FOR EACH ROW EXECUTE FUNCTION public.bills_auto_status();

COMMENT ON TABLE public.bills IS
  'One row per bill (one-off or generated by a bill_template). Recurring bills are templated, not duplicated. Receipts attach via documents table. Amounts in cents.';
