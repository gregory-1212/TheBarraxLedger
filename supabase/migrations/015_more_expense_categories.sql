-- Migration 015: additional expense categories (Greg, 2026-06-04)
--
-- Extends the 007 seed with categories tailored to The Barrax. Idempotent via
-- ON CONFLICT on the UNIQUE name, so a re-run is a no-op. All ordinary deductible
-- expenses. sort_order slots each near its related existing category. (Tax-line
-- mapping to be confirmed by the CPA; these are practical buckets, not official
-- IRS labels.)
INSERT INTO public.expense_categories (name, tax_treatment, sort_order) VALUES
  ('Dues & Subscriptions',                 'deductible', 45),   -- after Software / SaaS (40)
  ('Continuing Education / Certifications','deductible', 65),   -- after Professional Services (60)
  ('Ammunition',                           'deductible', 85),   -- after Range Supplies (80)
  ('Payroll / Wages',                      'deductible', 105),  -- before Contractor Pay (110)
  ('Licenses & Permits',                   'deductible', 122),  -- near Taxes & Fees (120)
  ('Merchant / Processing Fees',           'deductible', 125)   -- Stripe etc.; near Taxes & Fees
ON CONFLICT (name) DO NOTHING;
