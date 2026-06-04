"use client";

import { useState } from "react";
import Link from "next/link";

type Item = {
  id: string;
  vendorName: string | null;
  ocrVendor: string | null;
  categoryName: string | null;
  date: string | null;
  totalCents: number | null;
  lowConfidence: boolean;
  ocrFailed: boolean;
  thumbUrl: string | null;
  canApprove: boolean;
  possibleDuplicate: string | null;
};

function fmtDate(iso: string | null): string {
  if (!iso) return "no date";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmtMoney(c: number | null): string {
  if (c == null) return "no total";
  return `$${(c / 100).toFixed(2)}`;
}

export default function ReviewList({ items }: { items: Item[] }) {
  const [pending, setPending] = useState(items);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [approved, setApproved] = useState(0);

  async function approve(id: string) {
    setBusyId(id);
    setErrors((e) => ({ ...e, [id]: "" }));
    try {
      // No overrides: confirm the OCR'd values as-is. The endpoint enforces
      // total+date and writes the audit row only on the pending->confirmed flip.
      const res = await fetch(`/api/receipts/${id}/ocr`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrors((e) => ({ ...e, [id]: data.error || "Couldn't approve this one." }));
        return;
      }
      // Remove only AFTER the server confirms this specific receipt.
      setPending((prev) => prev.filter((x) => x.id !== id));
      setApproved((n) => n + 1);
    } catch {
      setErrors((e) => ({ ...e, [id]: "Network error — please try again." }));
    } finally {
      setBusyId(null);
    }
  }

  if (pending.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-800 bg-zinc-950 px-6 py-12 text-center">
        <p className="text-sm text-zinc-300">
          {approved > 0 ? `All caught up — ${approved} approved. 🎉` : "Nothing left to review."}
        </p>
        <div className="mt-3 flex items-center justify-center gap-4 text-sm">
          <Link href="/receipts/capture" className="text-zinc-200 hover:text-white underline">Add more receipts</Link>
          <Link href="/receipts" className="text-zinc-400 hover:text-zinc-200">Back to receipts</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {approved > 0 && <p className="text-xs text-emerald-300">{approved} approved this session.</p>}

      {pending.map((r) => (
        <div key={r.id} className="flex items-center gap-3 rounded-md border border-zinc-800 bg-zinc-950 p-3">
          {r.thumbUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={r.thumbUrl} alt="" className="h-16 w-16 shrink-0 rounded object-cover border border-zinc-800" />
          ) : (
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded border border-zinc-800 text-[10px] text-zinc-600">
              no image
            </span>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium text-zinc-100">
                {r.vendorName ?? r.ocrVendor ?? "Unassigned vendor"}
              </span>
              {r.lowConfidence && <span className="shrink-0 text-[10px] text-amber-400" title="OCR wasn't confident — check it">⚠ check</span>}
              {r.ocrFailed && <span className="shrink-0 text-[10px] text-orange-400">needs manual entry</span>}
            </div>
            <div className="mt-0.5 text-sm tabular-nums text-zinc-400">
              {fmtMoney(r.totalCents)} · {fmtDate(r.date)}
              {r.categoryName ? ` · ${r.categoryName}` : ""}
            </div>
            {r.possibleDuplicate && (
              <p className="mt-1 text-[11px] text-amber-300">⚠ Possible duplicate — {r.possibleDuplicate}</p>
            )}
            {errors[r.id] && <p className="mt-1 text-xs text-red-300">{errors[r.id]}</p>}
          </div>

          <div className="flex shrink-0 flex-col items-stretch gap-1.5">
            {r.canApprove ? (
              <button
                onClick={() => approve(r.id)}
                disabled={busyId === r.id}
                className="rounded-md bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-white transition-colors disabled:opacity-50"
              >
                {busyId === r.id ? "Approving…" : "Approve"}
              </button>
            ) : (
              <Link
                href={`/receipts/${r.id}`}
                className="rounded-md border border-amber-800/60 px-3 py-2 text-center text-sm text-amber-300 hover:bg-amber-950/30 transition-colors"
              >
                Add total + date
              </Link>
            )}
            <Link href={`/receipts/${r.id}`} className="text-center text-[11px] text-zinc-500 hover:text-zinc-300">
              Review
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}
