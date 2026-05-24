import { type SupabaseClient } from "@supabase/supabase-js";

// LED-47: Trigram fuzzy-match wrapper around the SQL function. Used by
// the receipts review queue (LED-22 / LED-47): OCR extracts a vendor
// string from a receipt; this helper suggests the most likely existing
// vendor match instead of letting the reviewer accidentally create
// duplicates.
//
// Threshold guidance per LED-47:
//   > 0.5  — auto-suggest as "Use this vendor?" in the review UI
//   0.3..0.5 — show as a low-confidence option
//   < 0.3  — hide; offer "+ Create new vendor"

export type SimilarVendor = {
  vendor_id: string;
  name: string;
  similarity: number;
};

export async function findSimilarVendors(
  supabase: SupabaseClient,
  queryName: string,
  options: { threshold?: number; maxResults?: number } = {},
): Promise<SimilarVendor[]> {
  const threshold = options.threshold ?? 0.3;
  const maxResults = options.maxResults ?? 20;

  const trimmed = queryName.trim();
  if (trimmed.length === 0) return [];

  const { data, error } = await supabase.rpc("find_similar_vendors", {
    query_name: trimmed,
    similarity_threshold: threshold,
    max_results: maxResults,
  });

  if (error) {
    throw new Error(`find_similar_vendors RPC failed: ${error.message}`);
  }

  return (data ?? []) as SimilarVendor[];
}
