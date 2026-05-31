"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ReceiptRow {
  id: string;
  status: string;
  ocr_status: string;
  ocr_error: string | null;
  ocr_data: { vendorName?: string | null; confidence?: Record<string, number> } | null;
  vendor_id: string | null;
  expense_category_id: string | null;
  receipt_date: string | null;
  total_cents: number | null;
  tax_cents: number | null;
  payment_method: string | null;
  notes: string | null;
}

interface Props {
  receipt: ReceiptRow;
  fileUrl: string | null;
  fileMime: string | null;
  vendors: { id: string; name: string }[];
  categories: { id: string; name: string }[];
}

const centsToStr = (c: number | null): string => (c == null ? "" : (c / 100).toFixed(2));
function strToCents(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function Conf({ c }: { c: number | undefined }) {
  if (c == null) return null;
  const pct = Math.round(c * 100);
  const color = c >= 0.85 ? "text-emerald-400" : c >= 0.6 ? "text-amber-400" : "text-orange-400";
  return <span className={`ml-2 text-[10px] ${color}`}>OCR {pct}%</span>;
}

export default function ReceiptReview({ receipt, fileUrl, fileMime, vendors, categories }: Props) {
  const router = useRouter();
  const conf = receipt.ocr_data?.confidence ?? {};

  const [vendorId, setVendorId] = useState(receipt.vendor_id ?? "");
  const [categoryId, setCategoryId] = useState(receipt.expense_category_id ?? "");
  const [dateStr, setDateStr] = useState(receipt.receipt_date ?? "");
  const [totalStr, setTotalStr] = useState(centsToStr(receipt.total_cents));
  const [taxStr, setTaxStr] = useState(centsToStr(receipt.tax_cents));
  const [paymentMethod, setPaymentMethod] = useState(receipt.payment_method ?? "");
  const [notes, setNotes] = useState(receipt.notes ?? "");

  const [status, setStatus] = useState(receipt.status);
  const [ocrStatus, setOcrStatus] = useState(receipt.ocr_status);
  const [ocrError, setOcrError] = useState(receipt.ocr_error);
  const [ocrSuggestedVendor, setOcrSuggestedVendor] = useState(receipt.ocr_data?.vendorName ?? null);

  const [busy, setBusy] = useState<"" | "confirm" | "reextract">("");
  const [error, setError] = useState<string | null>(null);

  async function post(payload: Record<string, unknown>) {
    const res = await fetch(`/api/receipts/${receipt.id}/ocr`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return { res, data: await res.json().catch(() => ({})) };
  }

  async function reExtract() {
    setBusy("reextract"); setError(null);
    try {
      const { res, data } = await post({ action: "re_extract" });
      if (!res.ok) { setError(data.error || "Re-extract failed."); return; }
      const r = data.receipt as ReceiptRow;
      setOcrStatus(r.ocr_status); setOcrError(r.ocr_error);
      setOcrSuggestedVendor(r.ocr_data?.vendorName ?? null);
      setDateStr(r.receipt_date ?? ""); setTotalStr(centsToStr(r.total_cents));
      setTaxStr(centsToStr(r.tax_cents)); setPaymentMethod(r.payment_method ?? "");
    } catch { setError("Network error — please try again."); }
    finally { setBusy(""); }
  }

  async function confirm() {
    setBusy("confirm"); setError(null);
    try {
      const { res, data } = await post({
        action: "confirm",
        overrides: {
          vendorId: vendorId || null,
          expenseCategoryId: categoryId || null,
          totalCents: strToCents(totalStr),
          taxCents: strToCents(taxStr),
          receiptDate: dateStr || null,
          paymentMethod: paymentMethod.trim() || null,
          notes: notes.trim() || null,
        },
      });
      if (!res.ok) { setError(data.error || "Could not save."); return; }
      setStatus("confirmed");
      router.refresh();
    } catch { setError("Network error — please try again."); }
    finally { setBusy(""); }
  }

  const labelCls = "block text-xs uppercase tracking-wide text-zinc-500 mb-1";
  const fieldCls = "w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-zinc-600";

  return (
    <div className="mt-3">
      <div className="mb-5 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Review Receipt</h1>
        <span className={`text-xs rounded-full px-2.5 py-1 ${status === "confirmed" ? "bg-emerald-950/50 text-emerald-300 border border-emerald-900/50" : "bg-amber-950/40 text-amber-300 border border-amber-900/50"}`}>
          {status === "confirmed" ? "Confirmed" : "Needs review"}
        </span>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Image / file */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
          {!fileUrl ? (
            <p className="text-sm text-zinc-500 p-6 text-center">File unavailable.</p>
          ) : fileMime === "application/pdf" ? (
            <iframe src={fileUrl} className="w-full h-[28rem] rounded-md border border-zinc-800" title="Receipt PDF" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fileUrl} alt="Receipt" className="w-full rounded-md border border-zinc-800" />
          )}
        </div>

        {/* Fields */}
        <div className="space-y-4">
          {ocrStatus === "failed" && (
            <div className="rounded-md border border-orange-900/50 bg-orange-950/30 px-3 py-2 text-xs text-orange-200">
              OCR couldn&apos;t read this one{ocrError ? `: ${ocrError}` : ""}. Enter the details by hand, or try Re-run OCR.
            </div>
          )}
          {ocrStatus === "skipped" && (
            <div className="rounded-md border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs text-zinc-400">
              OCR was skipped{ocrError ? ` (${ocrError})` : ""}. Enter the details by hand.
            </div>
          )}

          <div>
            <label className={labelCls}>Vendor<Conf c={conf.vendor_name} /></label>
            <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} className={fieldCls}>
              <option value="">— select vendor —</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            {ocrSuggestedVendor && !vendorId && (
              <p className="mt-1 text-[11px] text-zinc-500">OCR read: &ldquo;{ocrSuggestedVendor}&rdquo; — pick the matching vendor above.</p>
            )}
          </div>

          <div>
            <label className={labelCls}>Category</label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={fieldCls}>
              <option value="">— select category —</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Date<Conf c={conf.date} /></label>
              <input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} className={fieldCls} />
            </div>
            <div>
              <label className={labelCls}>Payment<Conf c={conf.payment_method} /></label>
              <input type="text" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} placeholder="Visa ****1234" className={fieldCls} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Total ($)<Conf c={conf.total_cents} /></label>
              <input type="text" inputMode="decimal" value={totalStr} onChange={(e) => setTotalStr(e.target.value)} placeholder="0.00" className={`${fieldCls} tabular-nums`} />
            </div>
            <div>
              <label className={labelCls}>Tax ($)<Conf c={conf.tax_cents} /></label>
              <input type="text" inputMode="decimal" value={taxStr} onChange={(e) => setTaxStr(e.target.value)} placeholder="0.00" className={`${fieldCls} tabular-nums`} />
            </div>
          </div>

          <div>
            <label className={labelCls}>Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={fieldCls} />
          </div>

          {error && <div className="rounded-md border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-200">{error}</div>}

          <div className="flex items-center gap-3 pt-1">
            <button onClick={confirm} disabled={!!busy}
              className="flex-1 rounded-md bg-zinc-100 px-3 py-2.5 text-sm font-medium text-zinc-900 hover:bg-white transition-colors disabled:opacity-50">
              {busy === "confirm" ? "Saving…" : status === "confirmed" ? "Save Changes" : "Confirm & Save"}
            </button>
            <button onClick={reExtract} disabled={!!busy}
              className="rounded-md border border-zinc-700 px-3 py-2.5 text-sm text-zinc-300 hover:bg-zinc-900 transition-colors disabled:opacity-50">
              {busy === "reextract" ? "Reading…" : "Re-run OCR"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
