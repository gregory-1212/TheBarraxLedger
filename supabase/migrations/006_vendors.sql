-- Migration 006: vendors table
-- LED-13: Track every entity money flows out to.
--
-- Per research/vendors.md, every modern SMB vendor tool has the same field set.
-- We adopt that union. Sensitive tax_id is encrypted (LED-38 wires app-layer AES);
-- the column exists from day 1 as bytea so the encryption migration is a no-op.
--
-- 1099 status uses vendors.is_1099_eligible + vendors.business_classification.
-- Contractors = vendors where is_1099_eligible=true (single contact model, Xero).
-- W-9 PDFs route through the universal documents archive (LED-34).

CREATE TYPE vendor_type AS ENUM (
  'subscription',
  'utility',
  'contractor',
  'supplier',
  'government',
  'other'
);

CREATE TYPE business_classification AS ENUM (
  'individual',
  'sole_proprietorship',
  'partnership',
  'llc',
  'c_corporation',
  's_corporation',
  'tax_exempt',
  'other'
);

CREATE TYPE vendor_status AS ENUM (
  'active',
  'inactive',
  'hold',
  'archived'
);

CREATE TYPE w9_status AS ENUM (
  'missing',
  'requested',
  'received',
  'verified'
);

CREATE TABLE public.vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  name text NOT NULL,
  dba text,                                    -- "Doing Business As" alias
  vendor_type vendor_type NOT NULL DEFAULT 'other',

  -- Contact
  contact_name text,
  contact_email text,
  contact_phone text,
  billing_address text,                        -- single text block, free-form

  -- Payment
  payment_method text,                         -- e.g. "Visa ending 1234", "ACH from BizChecking"
  default_expense_category text,               -- text for now; can FK to expense_categories later

  -- 1099 / tax
  is_1099_eligible boolean NOT NULL DEFAULT false,
  business_classification business_classification,
  tax_id_encrypted bytea,                      -- AES-256-GCM ciphertext, populated by LED-38 wiring
  w9_status w9_status NOT NULL DEFAULT 'missing',
  w9_requested_at timestamptz,
  w9_received_at timestamptz,
  w9_verified_at timestamptz,                  -- reserved for future TIN-match integration

  -- State
  status vendor_status NOT NULL DEFAULT 'active',
  notes text,

  -- Lifecycle
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX vendors_name_idx
  ON public.vendors (lower(name))
  WHERE deleted_at IS NULL;

CREATE INDEX vendors_type_idx
  ON public.vendors (vendor_type)
  WHERE deleted_at IS NULL;

CREATE INDEX vendors_1099_idx
  ON public.vendors (is_1099_eligible)
  WHERE deleted_at IS NULL AND is_1099_eligible = true;

CREATE INDEX vendors_status_idx
  ON public.vendors (status)
  WHERE deleted_at IS NULL;

-- pg_trgm name index for fuzzy match (LED-47, receipt vendor match)
-- pg_trgm extension was enabled in 001_extensions.sql
CREATE INDEX vendors_name_trgm
  ON public.vendors
  USING GIN (lower(name) gin_trgm_ops)
  WHERE deleted_at IS NULL;

ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;

CREATE POLICY vendors_staff_read ON public.vendors
  FOR SELECT USING (public.is_staff());

CREATE POLICY vendors_staff_insert ON public.vendors
  FOR INSERT WITH CHECK (public.is_staff());

CREATE POLICY vendors_staff_update ON public.vendors
  FOR UPDATE USING (public.is_staff());

-- No DELETE policy: soft-delete via deleted_at only (LED-39 hold/archive pattern).

CREATE TRIGGER vendors_touch_updated_at
  BEFORE UPDATE ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

COMMENT ON TABLE public.vendors IS
  'Every entity money flows out to. Contractors are vendors with is_1099_eligible=true (single contact model). Sensitive tax_id is encrypted via app-layer AES-256-GCM (key in TAX_ID_ENCRYPTION_KEY env, populated by LED-38 wiring).';

COMMENT ON COLUMN public.vendors.tax_id_encrypted IS
  'AES-256-GCM ciphertext. Decrypted server-side ONLY in the reveal endpoint or year-end CSV export, both audit-logged.';
