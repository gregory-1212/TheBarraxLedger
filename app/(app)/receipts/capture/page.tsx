"use client";

// LED-22/48: Batch receipt capture — snap/pick multiple receipts, upload them
// one after another (each OCR'd inline as it lands), then jump to the review
// screen to approve the batch. Single photo still goes straight to its review.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function CaptureReceiptPage() {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [someUploaded, setSomeUploaded] = useState(false);

  // Object-URL thumbnails for the picked files; revoked when the list changes.
  const previews = useMemo(
    () => files.map((f) => (f.type.startsWith("image/") ? URL.createObjectURL(f) : null)),
    [files],
  );
  useEffect(() => () => previews.forEach((u) => u && URL.revokeObjectURL(u)), [previews]);

  function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    setError(null);
    setFiles((prev) => [...prev, ...Array.from(list)]);
  }
  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function uploadAll() {
    if (files.length === 0) { setError("Add at least one receipt first."); return; }
    const total = files.length;
    setSubmitting(true);
    setError(null);
    setProgress({ done: 0, total });

    const failures: File[] = [];
    let succeeded = 0;
    let lastId: string | null = null;

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      try {
        const fd = new FormData();
        fd.append("file", f);
        const res = await fetch("/api/receipts/upload", { method: "POST", body: fd });
        const data = await res.json().catch(() => ({}));
        if (res.ok) { succeeded++; lastId = data.id ?? lastId; }
        else failures.push(f);
      } catch {
        failures.push(f);
      }
      setProgress({ done: i + 1, total });
    }

    setSubmitting(false);
    setFiles(failures); // keep only the ones that failed, ready to retry
    if (succeeded > 0) setSomeUploaded(true);

    if (failures.length === 0) {
      // All good → single receipt goes straight to its page; a batch goes to review.
      router.push(total === 1 && lastId ? `/receipts/${lastId}` : "/receipts/review");
      return;
    }
    setError(
      `${succeeded} uploaded, ${failures.length} didn't. The failed one${failures.length === 1 ? "" : "s"} ` +
        `${failures.length === 1 ? "is" : "are"} still listed — tap Upload to retry.` +
        (succeeded > 0 ? " Your uploaded receipts are waiting in Review." : ""),
    );
  }

  return (
    <div className="p-8 max-w-xl mx-auto">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <Link href="/receipts" className="text-xs text-zinc-500 hover:text-zinc-300">← Receipts</Link>
          <h1 className="text-2xl font-semibold tracking-tight mt-2">Add Receipts</h1>
          <p className="text-sm text-zinc-400 mt-1">Snap or pick as many as you like — we&apos;ll read each one, then you review them together.</p>
        </div>
        <Link href="/receipts/review" className="shrink-0 text-xs text-zinc-400 hover:text-zinc-200 underline">Review pending →</Link>
      </header>

      <div className="space-y-5 rounded-lg border border-zinc-800 bg-zinc-950 p-5">
        <div className="grid grid-cols-2 gap-3">
          {/* Take a Photo — opens the camera on a phone (one shot per tap; tap again for more). */}
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md bg-zinc-100 px-4 py-3.5 text-sm font-medium text-zinc-900 hover:bg-white transition-colors">
            <span aria-hidden>📷</span> Take a Photo
            <input type="file" accept="image/*" capture="environment" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} className="sr-only" />
          </label>
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-zinc-700 px-4 py-3.5 text-sm font-medium text-zinc-200 hover:bg-zinc-900 transition-colors">
            <span aria-hidden>🖼️</span> Choose Photos
            <input type="file" accept="image/*,application/pdf" multiple onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} className="sr-only" />
          </label>
        </div>
        <p className="text-center text-[11px] text-zinc-500">JPG, PNG, or PDF · take or choose more than one</p>

        {files.length > 0 && (
          <ul className="space-y-2">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center gap-3 rounded-md border border-zinc-800 bg-zinc-900/40 p-2">
                {previews[i] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previews[i] as string} alt="" className="h-12 w-12 shrink-0 rounded object-cover border border-zinc-800" />
                ) : (
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded border border-zinc-800 text-zinc-500 text-xs">PDF</span>
                )}
                <span className="min-w-0 flex-1 truncate text-sm text-zinc-300">{f.name || "receipt"}</span>
                {!submitting && (
                  <button type="button" onClick={() => removeFile(i)} className="shrink-0 text-xs text-zinc-500 hover:text-red-300" aria-label="Remove">
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {error && <div className="rounded-md border border-amber-900/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-200">{error}</div>}

        <button
          onClick={uploadAll}
          disabled={submitting || files.length === 0}
          className="w-full rounded-md bg-zinc-100 px-3 py-2.5 text-sm font-medium text-zinc-900 hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting
            ? `Uploading + reading ${progress.done} of ${progress.total}…`
            : files.length === 0
              ? "Upload Receipts"
              : `Upload ${files.length} Receipt${files.length === 1 ? "" : "s"}`}
        </button>
        {submitting && <p className="text-center text-xs text-zinc-500">Reading each receipt with OCR — a few seconds each.</p>}
        {someUploaded && !submitting && (
          <Link href="/receipts/review" className="block text-center text-sm text-zinc-200 hover:text-white underline">
            Go to Review →
          </Link>
        )}
      </div>
    </div>
  );
}
