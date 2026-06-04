"use client";

// LED-22: Receipt capture — pick a file or snap a photo, upload, then jump to
// the review page where OCR has pre-filled the fields.

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function CaptureReceiptPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onPick(f: File | null) {
    setError(null);
    setFile(f);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(f && f.type.startsWith("image/") ? URL.createObjectURL(f) : null);
  }

  async function submit() {
    if (!file) { setError("Pick a photo or file first."); return; }
    setSubmitting(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (notes.trim()) fd.append("notes", notes.trim());
      const res = await fetch("/api/receipts/upload", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || "Upload failed. Please try again."); return; }
      router.push(`/receipts/${data.id}`);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-8 max-w-xl mx-auto">
      <header className="mb-6">
        <Link href="/receipts" className="text-xs text-zinc-500 hover:text-zinc-300">← Receipts</Link>
        <h1 className="text-2xl font-semibold tracking-tight mt-2">Add a Receipt</h1>
        <p className="text-sm text-zinc-400 mt-1">Snap a photo or upload a file. We&apos;ll read the vendor, date, and total for you to confirm.</p>
      </header>

      <div className="space-y-5 rounded-lg border border-zinc-800 bg-zinc-950 p-5">
        <div className="space-y-3">
          {/* Take a Photo — opens the camera directly on a phone (capture attr).
              On desktop there's no camera so it falls back to a file dialog. */}
          <label className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-zinc-100 px-4 py-3.5 text-sm font-medium text-zinc-900 hover:bg-white transition-colors">
            <span aria-hidden>📷</span> Take a Photo
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => onPick(e.target.files?.[0] ?? null)}
              className="sr-only"
            />
          </label>
          <label className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-zinc-700 px-4 py-3.5 text-sm font-medium text-zinc-200 hover:bg-zinc-900 transition-colors">
            <span aria-hidden>🖼️</span> Choose Photo or File
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => onPick(e.target.files?.[0] ?? null)}
              className="sr-only"
            />
          </label>
          <p className="text-center text-[11px] text-zinc-500">JPG, PNG, or PDF</p>
        </div>

        {file && (
          <div className="rounded-md border border-zinc-800 bg-zinc-900/40 p-3">
            <div className="text-sm text-zinc-300 truncate">{file.name}</div>
            <div className="text-xs text-zinc-500">{(file.size / 1024).toFixed(0)} KB</div>
            {previewUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="Receipt preview" className="mt-3 max-h-64 rounded-md border border-zinc-800" />
            )}
          </div>
        )}

        <div>
          <label className="block text-xs uppercase tracking-wide text-zinc-500 mb-2">Notes (optional)</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="e.g. lunch with the range insurance rep" className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-zinc-600" />
        </div>

        {error && <div className="rounded-md border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-200">{error}</div>}

        <button
          onClick={submit}
          disabled={submitting || !file}
          className="w-full rounded-md bg-zinc-100 px-3 py-2.5 text-sm font-medium text-zinc-900 hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? "Uploading + reading…" : "Upload Receipt"}
        </button>
        {submitting && <p className="text-center text-xs text-zinc-500">Reading the receipt with OCR — this takes a few seconds.</p>}
      </div>
    </div>
  );
}
