import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

// GET /api/documents/search?q=&entity_type=&tags=&limit=
// Returns documents matching the filters. RLS gates by staff allowlist.
// Middleware also enforces auth on this route, but we double-check inside.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const q = params.get("q")?.trim();
  const entityType = params.get("entity_type")?.trim();
  const tagsParam = params.get("tags")?.trim();
  const limit = Math.min(parseInt(params.get("limit") ?? "50", 10) || 50, 200);

  let query = supabase
    .from("documents")
    .select(
      "id, original_filename, mime_type, size_bytes, uploaded_at, tags, entity_type, entity_id",
    )
    .is("deleted_at", null)
    .order("uploaded_at", { ascending: false })
    .limit(limit);

  if (entityType) {
    query = query.eq("entity_type", entityType);
  }

  if (tagsParam) {
    const tags = tagsParam
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (tags.length) {
      query = query.contains("tags", tags);
    }
  }

  if (q) {
    query = query.textSearch("ocr_text", q, { type: "websearch" });
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ documents: data ?? [] });
}
