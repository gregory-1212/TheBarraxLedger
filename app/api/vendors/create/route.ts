import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

// POST /api/vendors/create  { name }
//
// Minimal vendor create for the inline "+ Add a new vendor" flow on receipt
// review: name only, vendor_type defaults to 'other'. For retail stores
// (Home Depot, Kroger, etc.) a name is all that's needed — no contact, address,
// or 1099 info applies.
//
// Idempotent on case-insensitive name: if a vendor with that exact name already
// exists, return it instead of creating a duplicate — so a chain shopped at
// multiple locations stays a single vendor. Staff-only (RLS via the session client).
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { name?: unknown };
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Vendor name is required." }, { status: 400 });
  if (name.length > 200) return NextResponse.json({ error: "Vendor name is too long." }, { status: 400 });

  // Reuse an existing vendor with the same name (case-insensitive) rather than
  // duplicating. ilike with no wildcards is a full case-insensitive match.
  const { data: existing } = await supabase
    .from("vendors")
    .select("id, name")
    .is("deleted_at", null)
    .ilike("name", name)
    .limit(1)
    .maybeSingle();
  if (existing) return NextResponse.json({ vendor: existing, created: false });

  const { data, error } = await supabase
    .from("vendors")
    .insert({ name, vendor_type: "other" })
    .select("id, name")
    .single();
  if (error || !data) {
    return NextResponse.json(
      { error: `Could not create vendor: ${error?.message ?? "unknown"}` },
      { status: 500 },
    );
  }
  return NextResponse.json({ vendor: data, created: true });
}
