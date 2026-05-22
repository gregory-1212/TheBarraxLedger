import { createClient } from "@/utils/supabase/server";
import { logAudit, AUDIT_ACTIONS } from "@/utils/audit-log";

const BUCKET = "documents";

export type DocumentEntityType =
  | "vendor"
  | "compliance_item"
  | "bill"
  | "receipt"
  | "form_1099_delivery";

export type DocumentRow = {
  id: string;
  storage_path: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  uploaded_at: string;
  tags: string[];
  entity_type: string;
  entity_id: string;
};

function safeFilenameExt(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot < 0 || dot === filename.length - 1) return "bin";
  return filename
    .slice(dot + 1)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 8) || "bin";
}

export async function uploadDocument(params: {
  body: Blob | ArrayBuffer | Uint8Array;
  filename: string;
  mimeType: string;
  entityType: DocumentEntityType;
  entityId: string;
  tags?: string[];
  sizeBytes: number;
}): Promise<{ id: string; storagePath: string }> {
  const supabase = await createClient();

  const ext = safeFilenameExt(params.filename);
  const storagePath = `${params.entityType}/${params.entityId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, params.body, {
      contentType: params.mimeType,
      cacheControl: "3600",
      upsert: false,
    });
  if (uploadError) {
    throw new Error(`Document upload failed: ${uploadError.message}`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("documents")
    .insert({
      storage_path: storagePath,
      original_filename: params.filename,
      mime_type: params.mimeType,
      size_bytes: params.sizeBytes,
      uploaded_by: user?.id ?? null,
      tags: params.tags ?? [],
      entity_type: params.entityType,
      entity_id: params.entityId,
    })
    .select("id")
    .single();

  if (error || !data) {
    // Storage upload succeeded but row insert failed — try to clean up.
    await supabase.storage.from(BUCKET).remove([storagePath]);
    throw new Error(`Document row insert failed: ${error?.message ?? "unknown"}`);
  }

  return { id: data.id, storagePath };
}

export async function getSignedUrl(documentId: string, ttlSeconds = 300): Promise<string> {
  const supabase = await createClient();

  const { data: doc, error: fetchError } = await supabase
    .from("documents")
    .select("storage_path, original_filename, deleted_at")
    .eq("id", documentId)
    .single();

  if (fetchError || !doc) {
    throw new Error(`Document not found: ${documentId}`);
  }
  if (doc.deleted_at) {
    throw new Error("Document is deleted");
  }

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(doc.storage_path, ttlSeconds, {
      download: doc.original_filename,
    });

  if (error || !data?.signedUrl) {
    throw new Error(`Signed URL generation failed: ${error?.message ?? "unknown"}`);
  }

  await logAudit({
    action: AUDIT_ACTIONS.DOCUMENT_DOWNLOAD,
    entityType: "document",
    entityId: documentId,
    metadata: { ttl_seconds: ttlSeconds },
  });

  return data.signedUrl;
}

export async function softDeleteDocument(documentId: string): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("documents")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", documentId)
    .is("deleted_at", null);

  if (error) {
    throw new Error(`Document soft-delete failed: ${error.message}`);
  }

  await logAudit({
    action: AUDIT_ACTIONS.DOCUMENT_DELETE,
    entityType: "document",
    entityId: documentId,
  });
}

export async function listDocumentsForEntity(
  entityType: DocumentEntityType,
  entityId: string,
): Promise<DocumentRow[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("documents")
    .select(
      "id, storage_path, original_filename, mime_type, size_bytes, uploaded_at, tags, entity_type, entity_id",
    )
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .is("deleted_at", null)
    .order("uploaded_at", { ascending: false });

  if (error) {
    throw new Error(`Document list failed: ${error.message}`);
  }
  return (data ?? []) as DocumentRow[];
}
