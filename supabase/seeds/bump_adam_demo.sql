-- Bump [DEMO] Adam Ads LLC YTD spend over the $2,000 backup-withholding
-- threshold so the red banner on his vendor detail page is demonstrable.
--
-- Pre-existing demo: 1 paid bill of $750. Adds two more for $850 + $1,200
-- → total YTD $2,800 → triggers LED-44 red "Backup withholding required" banner.
--
-- Tagged [DEMO] like the rest of the seed; remove with
--   node scripts/run-ddl.mjs supabase/seeds/remove_demo_data.sql

DO $$
DECLARE
  v_adam uuid;
  cat_marketing uuid;
  today date := CURRENT_DATE;
BEGIN
  SELECT id INTO v_adam
    FROM public.vendors
   WHERE name = '[DEMO] Adam Ads LLC'
   LIMIT 1;

  SELECT id INTO cat_marketing
    FROM public.expense_categories
   WHERE name = 'Marketing & Advertising';

  IF v_adam IS NULL THEN
    RAISE EXCEPTION 'Adam Ads demo vendor not found — seed demo_data.sql first';
  END IF;

  -- $850 Meta ads buy, paid ~30 days ago
  INSERT INTO public.bills (
    vendor_id, expense_category_id, amount_cents, amount_paid_cents,
    due_date, paid_date, payment_method, reference, status, notes
  ) VALUES (
    v_adam, cat_marketing, 85000, 85000,
    today - 32, today - 30, 'ACH from BizChecking', '[DEMO] meta-apr',
    'paid', 'DEMO DATA — remove via supabase/seeds/remove_demo_data.sql'
  );

  -- $1,200 additional services, paid 5 days ago
  INSERT INTO public.bills (
    vendor_id, expense_category_id, amount_cents, amount_paid_cents,
    due_date, paid_date, payment_method, reference, status, notes
  ) VALUES (
    v_adam, cat_marketing, 120000, 120000,
    today - 7, today - 5, 'ACH from BizChecking', '[DEMO] additional-svcs',
    'paid', 'DEMO DATA — remove via supabase/seeds/remove_demo_data.sql'
  );

  RAISE NOTICE 'Added 2 demo bills for Adam Ads — YTD should now be $2,800 (red backup-withholding banner triggers).';
END$$;
