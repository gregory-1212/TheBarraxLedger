import { createClient } from "@/utils/supabase/server";

// Compliance item history helper. Writes to compliance_item_history with the
// authenticated staff's identity. RLS allows staff to INSERT, and rows are
// read-only after that (we never UPDATE or DELETE history).
//
// event_type values used:
//   'created'           — initial row creation (LED-7 create form writes this)
//   'status_changed'    — Mark in progress / Re-open
//   'filed'             — Mark filed (with last_filed_date update)
//   'completed'         — Mark done
//   'edited'            — fields updated via edit form
//   'document_attached' — document uploaded
//   'document_removed'  — document soft-deleted

export type ComplianceEventType =
  | "created"
  | "status_changed"
  | "filed"
  | "completed"
  | "reopened"
  | "edited"
  | "document_attached"
  | "document_removed"
  | "noted";

export async function logComplianceHistory(params: {
  complianceItemId: string;
  eventType: ComplianceEventType;
  details?: Record<string, unknown>;
}): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    throw new Error("logComplianceHistory: no authenticated user");
  }

  const { error } = await supabase.from("compliance_item_history").insert({
    compliance_item_id: params.complianceItemId,
    actor_id: user.id,
    actor_email: user.email,
    event_type: params.eventType,
    details: (params.details ?? {}) as never,
  });

  if (error) {
    // Don't throw — history is best-effort. We don't want a history write
    // failure to break the user's primary action (e.g. marking filed).
    console.error("[compliance-history] insert failed:", error);
  }
}
