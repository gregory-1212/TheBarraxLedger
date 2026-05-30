"use client";

import { useState } from "react";

// LED-38: client-side reveal control for a vendor's tax ID.
// Shows the masked value by default; on "Reveal" it POSTs to the reveal
// endpoint (which decrypts + audit-logs server-side) and shows the full
// number until the user hides it again. The full TIN never ships in the
// page payload — only the mask does.

type TinType = "EIN" | "SSN" | "";

export function RevealTin({
  vendorId,
  masked,
}: {
  vendorId: string;
  masked: string;
}) {
  const [revealed, setRevealed] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reveal() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/vendors/${vendorId}/reveal-tin`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Reveal failed (${res.status})`);
      }
      const { tin, tinType } = (await res.json()) as {
        tin: string;
        tinType: TinType;
      };
      setRevealed(formatTin(tin, tinType));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (revealed) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="font-mono tabular-nums text-zinc-100">{revealed}</span>
        <button
          type="button"
          onClick={() => setRevealed(null)}
          className="text-xs text-zinc-500 hover:text-zinc-300"
        >
          Hide
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-mono tabular-nums text-zinc-300">{masked}</span>
      <button
        type="button"
        onClick={reveal}
        disabled={loading}
        className="text-xs text-sky-400 hover:text-sky-300 disabled:opacity-50"
      >
        {loading ? "Revealing…" : "Reveal"}
      </button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </span>
  );
}

// Re-apply the conventional dashes for display only.
function formatTin(tin: string, tinType: TinType): string {
  const d = tin.replace(/\D/g, "");
  if (d.length !== 9) return tin;
  if (tinType === "EIN") return `${d.slice(0, 2)}-${d.slice(2)}`;
  // SSN or unknown → SSN-style grouping
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
}
