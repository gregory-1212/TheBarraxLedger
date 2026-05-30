import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { logAudit, AUDIT_ACTIONS } from "@/utils/audit-log";
import { decryptTaxId, maskTaxId } from "@/utils/tax-id";
import { tinTypeForClassification } from "@/utils/iris-1099-nec";

// LED-38: POST /api/vendors/<id>/reveal-tin
//
// Staff-only. Decrypts the vendor's TIN, writes a TIN_REVEAL audit entry, and
// returns the plaintext. POST (not GET) so the reveal can't be prefetched or
// cached and every reveal is an explicit, logged action. The full TIN is
// returned ONLY here — never from a list or detail query.

export async function POST(
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

  const { data: vendor, error } = await supabase
    .from("vendors")
    .select("id, business_classification, tax_id_encrypted")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!vendor) {
    return NextResponse.json({ error: "vendor not found" }, { status: 404 });
  }
  if (!vendor.tax_id_encrypted) {
    return NextResponse.json({ error: "no tax ID on file" }, { status: 404 });
  }

  let tin: string;
  try {
    tin = decryptTaxId(vendor.tax_id_encrypted as string);
  } catch (e) {
    console.error("[reveal-tin] decrypt failed:", (e as Error).message);
    return NextResponse.json(
      { error: "could not decrypt tax ID" },
      { status: 500 },
    );
  }

  const tinType = tinTypeForClassification(vendor.business_classification);

  // Audit the reveal. We log only the masked form (last 4), never plaintext.
  // logAudit() throws on failure — if we can't record the reveal, we don't
  // return the TIN.
  await logAudit({
    action: AUDIT_ACTIONS.TIN_REVEAL,
    entityType: "vendor",
    entityId: id,
    metadata: { masked: maskTaxId(tin, tinType) },
  });

  return new NextResponse(JSON.stringify({ tin, tinType }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
