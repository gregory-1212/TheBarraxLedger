-- Demo data for Julie's first walkthrough — 2026-05-22.
-- Every row has a `[DEMO]` prefix on its primary name + a notes tag.
-- Remove with:
--   node scripts/run-ddl.mjs supabase/seeds/remove_demo_data.sql

DO $$
DECLARE
  -- Vendor IDs captured for downstream bill inserts
  v_vercel uuid;
  v_supabase uuid;
  v_nashville_electric uuid;
  v_eric uuid;
  v_adam uuid;

  -- Expense category IDs (lookup by seeded name)
  cat_software uuid;
  cat_utilities uuid;
  cat_contractor uuid;
  cat_marketing uuid;

  -- Date anchors — keep relative to today so the demo stays "live"
  today date := CURRENT_DATE;
BEGIN
  -- Look up expense category IDs from the seed
  SELECT id INTO cat_software       FROM public.expense_categories WHERE name = 'Software / SaaS';
  SELECT id INTO cat_utilities      FROM public.expense_categories WHERE name = 'Utilities';
  SELECT id INTO cat_contractor     FROM public.expense_categories WHERE name = 'Contractor Pay';
  SELECT id INTO cat_marketing      FROM public.expense_categories WHERE name = 'Marketing & Advertising';

  -- ── Vendors ─────────────────────────────────────────────────────────────

  INSERT INTO public.vendors (
    name, vendor_type, contact_email, payment_method,
    default_expense_category, is_1099_eligible, business_classification,
    status, notes
  ) VALUES (
    '[DEMO] Vercel Inc.', 'subscription', 'billing@vercel.com',
    'Visa ending 1234', 'Software / SaaS', false, 'c_corporation',
    'active', 'DEMO DATA — remove via supabase/seeds/remove_demo_data.sql'
  ) RETURNING id INTO v_vercel;

  INSERT INTO public.vendors (
    name, vendor_type, contact_email, payment_method,
    default_expense_category, is_1099_eligible, business_classification,
    status, notes
  ) VALUES (
    '[DEMO] Supabase Inc.', 'subscription', 'support@supabase.io',
    'Visa ending 1234', 'Software / SaaS', false, 'c_corporation',
    'active', 'DEMO DATA — remove via supabase/seeds/remove_demo_data.sql'
  ) RETURNING id INTO v_supabase;

  INSERT INTO public.vendors (
    name, vendor_type, contact_name, payment_method,
    default_expense_category, is_1099_eligible,
    status, notes
  ) VALUES (
    '[DEMO] Nashville Electric Service', 'utility', 'Billing Dept',
    'ACH from BizChecking', 'Utilities', false,
    'active', 'DEMO DATA — remove via supabase/seeds/remove_demo_data.sql'
  ) RETURNING id INTO v_nashville_electric;

  INSERT INTO public.vendors (
    name, vendor_type, contact_email,
    default_expense_category, is_1099_eligible, business_classification, w9_status, w9_received_at,
    status, notes
  ) VALUES (
    '[DEMO] Eric Arnsberger', 'contractor', 'eric@example.com',
    'Contractor Pay', true, 'individual', 'received', now() - interval '60 days',
    'active', 'DEMO DATA — remove via supabase/seeds/remove_demo_data.sql'
  ) RETURNING id INTO v_eric;

  -- Demonstrates the "missing W-9 + spending continues" warning state
  INSERT INTO public.vendors (
    name, vendor_type, contact_email,
    default_expense_category, is_1099_eligible, business_classification, w9_status,
    status, notes
  ) VALUES (
    '[DEMO] Adam Ads LLC', 'contractor', 'adam@example.com',
    'Marketing & Advertising', true, 'llc', 'missing',
    'active', 'DEMO DATA — remove via supabase/seeds/remove_demo_data.sql'
  ) RETURNING id INTO v_adam;

  -- ── Compliance items ────────────────────────────────────────────────────
  -- Mix of urgencies so the scorecard + severity colors show variety.

  INSERT INTO public.compliance_items (
    title, category, jurisdiction, compliance_type,
    cadence_interval, next_due_date, status, cost_cents, notes
  ) VALUES (
    '[DEMO] TN Sales Tax — May filing', 'tax', 'TN', 'sales_tax',
    interval '1 month', today + 3, 'pending', 0,
    'DEMO DATA — remove via supabase/seeds/remove_demo_data.sql'
  );

  INSERT INTO public.compliance_items (
    title, category, jurisdiction, compliance_type,
    cadence_interval, next_due_date, status, cost_cents, notes
  ) VALUES (
    '[DEMO] NV Annual List', 'state', 'NV', 'annual_list',
    interval '1 year', today + 24, 'pending', 35000,
    'DEMO DATA — remove via supabase/seeds/remove_demo_data.sql'
  );

  INSERT INTO public.compliance_items (
    title, category, jurisdiction, compliance_type,
    cadence_interval, next_due_date, status, cost_cents, notes
  ) VALUES (
    '[DEMO] TN Annual Report', 'state', 'TN', 'annual_report',
    interval '1 year', date '2027-04-01', 'pending', 30000,
    'DEMO DATA — remove via supabase/seeds/remove_demo_data.sql'
  );

  INSERT INTO public.compliance_items (
    title, category, jurisdiction, compliance_type,
    cadence_interval, next_due_date, status, cost_cents, notes
  ) VALUES (
    '[DEMO] NV Registered Agent Renewal', 'state', 'NV', 'registered_agent_renewal',
    interval '1 year', today + 220, 'pending', 12500,
    'DEMO DATA — remove via supabase/seeds/remove_demo_data.sql'
  );

  -- Demonstrates 3-year cadence (FFL is the only common one)
  INSERT INTO public.compliance_items (
    title, category, jurisdiction, compliance_type,
    cadence_interval, next_due_date, status, cost_cents, notes
  ) VALUES (
    '[DEMO] BATFE FFL Renewal', 'federal', 'FED', 'ffl_renewal',
    interval '3 years', today + 820, 'pending', 9000,
    'DEMO DATA — remove via supabase/seeds/remove_demo_data.sql'
  );

  -- ── Bills ───────────────────────────────────────────────────────────────
  -- Mix of due-soon, paid-recent, and a partial to exercise tabs + totals.

  -- Vercel monthly, due in 5 days (urgent on calendar + dashboard)
  INSERT INTO public.bills (
    vendor_id, expense_category_id, amount_cents,
    due_date, payment_method, reference, status, notes
  ) VALUES (
    v_vercel, cat_software, 2000,
    today + 5, 'Visa ending 1234', '[DEMO] inv-2026-05', 'pending',
    'DEMO DATA — remove via supabase/seeds/remove_demo_data.sql'
  );

  -- Supabase monthly, due in 8 days (within 30-day forecast)
  INSERT INTO public.bills (
    vendor_id, expense_category_id, amount_cents,
    due_date, payment_method, status, notes
  ) VALUES (
    v_supabase, cat_software, 2500,
    today + 8, 'Visa ending 1234', 'pending',
    'DEMO DATA — remove via supabase/seeds/remove_demo_data.sql'
  );

  -- Nashville Electric, due in 19 days
  INSERT INTO public.bills (
    vendor_id, expense_category_id, amount_cents,
    due_date, payment_method, reference, status, notes
  ) VALUES (
    v_nashville_electric, cat_utilities, 18750,
    today + 19, 'ACH from BizChecking', '[DEMO] acct-44781', 'pending',
    'DEMO DATA — remove via supabase/seeds/remove_demo_data.sql'
  );

  -- Eric paid 7 days ago — recent on Paid tab
  INSERT INTO public.bills (
    vendor_id, expense_category_id, amount_cents, amount_paid_cents,
    due_date, paid_date, payment_method, status, notes
  ) VALUES (
    v_eric, cat_contractor, 120000, 120000,
    today - 10, today - 7, 'ACH from BizChecking', 'paid',
    'DEMO DATA — remove via supabase/seeds/remove_demo_data.sql'
  );

  -- Adam Ads paid 12 days ago — recent on Paid tab + builds up to threshold warning later
  INSERT INTO public.bills (
    vendor_id, expense_category_id, amount_cents, amount_paid_cents,
    due_date, paid_date, payment_method, status, notes
  ) VALUES (
    v_adam, cat_marketing, 75000, 75000,
    today - 15, today - 12, 'ACH from BizChecking', 'paid',
    'DEMO DATA — remove via supabase/seeds/remove_demo_data.sql'
  );

  RAISE NOTICE 'Demo data inserted: 5 vendors, 5 compliance items, 5 bills. Remove with supabase/seeds/remove_demo_data.sql.';
END$$;
