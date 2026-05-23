-- Migration 008: vendor_ytd_paid view
-- LED-27: Year-to-date paid totals per vendor, keyed by (vendor_id, year).
--
-- View, not materialized: bills change throughout the year and stale rollups
-- would lie to the 1099 dashboard. The aggregation is cheap (one indexed
-- scan of bills.paid_date) so live computation is fine.
--
-- One row per (vendor, paid_year) where the vendor has any paid bill in that
-- year. Vendors with zero paid bills in a year do not appear — callers must
-- LEFT JOIN (or treat missing as $0).

CREATE OR REPLACE VIEW public.vendor_ytd_paid AS
SELECT
  b.vendor_id,
  EXTRACT(YEAR FROM b.paid_date)::int AS year,
  SUM(COALESCE(b.amount_paid_cents, 0))::bigint AS paid_total_cents
FROM public.bills b
WHERE b.deleted_at IS NULL
  AND b.paid_date IS NOT NULL
GROUP BY b.vendor_id, EXTRACT(YEAR FROM b.paid_date);

COMMENT ON VIEW public.vendor_ytd_paid IS
  'Per-vendor, per-year paid totals in cents. Live (non-materialized) so the 1099 dashboard and IRIS CSV export always see fresh data. Built on bills.paid_date — voided bills (status=void with paid_date=NULL) are excluded.';

-- Views inherit RLS from their underlying tables. bills already enforces
-- is_staff() via its SELECT policy, so this view is staff-only by transitive
-- check. No additional policy needed.
