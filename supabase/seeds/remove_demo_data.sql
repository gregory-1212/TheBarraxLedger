-- Cleanup script for demo_data.sql.
-- Hard-deletes every row that has a [DEMO] marker. Run via:
--   node scripts/run-ddl.mjs supabase/seeds/remove_demo_data.sql
--
-- Safe to run multiple times — DELETEs are no-ops if rows already gone.
-- Bills first (FK from bills.vendor_id → vendors with ON DELETE RESTRICT).

DELETE FROM public.bills
 WHERE notes LIKE '%DEMO DATA — remove via supabase/seeds/remove_demo_data.sql%'
    OR reference LIKE '[DEMO]%';

DELETE FROM public.compliance_items
 WHERE title LIKE '[DEMO]%';

DELETE FROM public.vendors
 WHERE name LIKE '[DEMO]%';

-- compliance_item_history rows cascade-delete with their parent.
-- documents (uploaded files) for demo entities — none exist yet, but if they
-- did they'd reference entity_type/entity_id of the now-deleted parents; clean
-- those up too just in case:
DELETE FROM public.documents
 WHERE entity_type IN ('vendor', 'compliance_item', 'bill')
   AND entity_id NOT IN (
     SELECT id FROM public.vendors
     UNION SELECT id FROM public.compliance_items
     UNION SELECT id FROM public.bills
   );
