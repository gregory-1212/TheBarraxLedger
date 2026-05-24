import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getSignedUrl } from "@/utils/documents";

// LED-40 + foundation: GET /api/documents/<id>/download
// Generates a short-lived signed URL for the underlying Supabase Storage
// object and 302-redirects the browser to it. Browser then downloads with
// the original filename (set via the createSignedUrl `download` option).
//
// Audit log entry is written inside getSignedUrl(); no need to log here.

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  void request;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  let url: string;
  try {
    url = await getSignedUrl(id, 300); // 5-minute TTL is enough for a browser fetch
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 404 },
    );
  }

  return NextResponse.redirect(url, 302);
}
