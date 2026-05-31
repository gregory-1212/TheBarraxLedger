import { headers } from "next/headers";
import { createClient } from "@/utils/supabase/server";

// Action constants — extend as we add sensitive routes.
// Keep these as string literals (not an enum) so they're easy to grep.
export const AUDIT_ACTIONS = {
  TIN_REVEAL: "tin_reveal",
  TIN_UPDATE: "tin_update",
  DOCUMENT_DOWNLOAD: "document_download",
  DOCUMENT_DELETE: "document_delete",
  CSV_EXPORT: "csv_export",
  YEAR_END_PACKET_EXPORT: "year_end_packet_export",
  VENDOR_DELETE: "vendor_delete",
  COMPLIANCE_FILED: "compliance_filed",
  FORM_1099_DELIVERED: "form_1099_delivered",
  RECEIPT_UPLOADED: "receipt_uploaded",
  RECEIPT_CONFIRMED: "receipt_confirmed",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS] | string;

export async function logAudit(params: {
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const supabase = await createClient();
  const headersList = await headers();
  const ip =
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headersList.get("x-real-ip") ??
    null;

  const { error } = await supabase.rpc("log_audit", {
    p_action: params.action,
    p_entity_type: params.entityType ?? null,
    p_entity_id: params.entityId ?? null,
    p_metadata: (params.metadata ?? {}) as never,
    p_ip_address: ip,
  });

  if (error) {
    // Audit writes must be observable. We throw so callers explicitly decide
    // whether to swallow (rarely correct) or surface to the user.
    console.error("[audit-log] write failed:", error);
    throw new Error(`Audit log write failed: ${error.message}`);
  }
}
