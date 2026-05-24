-- Migration 009: find_similar_vendors() function
-- LED-47: Fuzzy-match vendor names via pg_trgm. Used (eventually) by the
-- receipts review queue (LED-22 / LED-47): after OCR extracts a vendor
-- string like "SHELL #1234 NASHVILLE TN", surface existing vendors that
-- likely match ("Shell Gas Station") above a similarity threshold so the
-- reviewer can pick instead of accidentally creating a duplicate.
--
-- pg_trgm extension is already enabled (001_extensions.sql) and the
-- GIN trigram index on lower(vendors.name) is already created (006_vendors.sql).
-- This migration just adds the function. It's read-only and non-destructive.

CREATE OR REPLACE FUNCTION public.find_similar_vendors(
  query_name text,
  similarity_threshold real DEFAULT 0.3,
  max_results int DEFAULT 20
)
RETURNS TABLE (
  vendor_id uuid,
  name text,
  similarity real
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    v.id AS vendor_id,
    v.name,
    similarity(lower(v.name), lower(query_name)) AS similarity
  FROM public.vendors v
  WHERE v.deleted_at IS NULL
    AND similarity(lower(v.name), lower(query_name)) > similarity_threshold
  ORDER BY similarity DESC, lower(v.name) ASC
  LIMIT max_results;
$$;

COMMENT ON FUNCTION public.find_similar_vendors IS
  'Trigram-similarity fuzzy match against vendors.name. Returns ordered list of {vendor_id, name, similarity}. Caller passes the noisy extracted name (e.g. from receipt OCR) and an optional similarity threshold; LED-47 spec recommends 0.3 baseline, auto-suggest at > 0.5. RLS on vendors transitively applies via SECURITY INVOKER (calls run as the requesting user).';

-- Grant execute to authenticated role so the staff client (which authenticates
-- through Supabase Auth) can call this via supabase.rpc('find_similar_vendors').
-- RLS on the underlying vendors table still gates which rows are visible.
GRANT EXECUTE ON FUNCTION public.find_similar_vendors(text, real, int) TO authenticated;
