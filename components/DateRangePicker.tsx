import Link from "next/link";
import {
  DATE_RANGE_PRESET_LABELS,
  DATE_RANGE_PRESET_ORDER,
  type DateRangePreset,
  type DateRange,
  resolvePreset,
  detectPreset,
} from "@/utils/date-ranges";

// LED-52: Shared date range picker. Server component — state lives in URL.
//
// Consumers pass `basePath` (e.g. "/reports") + the current URL params
// they want preserved. The component emits `<Link>`s that swap the
// `range`, `from`, `to` params in-place.
//
// URL contract (matches LED-52 acceptance):
//   ?range=ytd                                    ← preset
//   ?from=2026-01-01&to=2026-03-31                ← explicit dates
//   ?range=custom&from=...&to=...                 ← also accepted
//
// Reading: prefer explicit from/to. If absent, fall back to `range`. If
// also absent, defaults to YTD (LED-52 default).

export type DateRangePickerState = {
  preset: DateRangePreset;
  range: DateRange;
};

/**
 * Hydrate picker state from URL params. Use this in the consumer page's
 * server component to derive what's currently selected.
 */
export function readDateRangeFromParams(
  params: { range?: string; from?: string; to?: string } = {},
  today: Date = new Date(),
): DateRangePickerState {
  const isISO = (s: string | undefined) =>
    typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

  if (isISO(params.from) && isISO(params.to)) {
    const range = { from: params.from!, to: params.to! };
    const preset =
      params.range === "custom" ? "custom" : detectPreset(range, today);
    return { preset, range };
  }

  const preset: DateRangePreset =
    (DATE_RANGE_PRESET_ORDER as string[]).includes(params.range ?? "")
      ? (params.range as DateRangePreset)
      : "ytd";
  return { preset, range: resolvePreset(preset, { today }) };
}

/**
 * Server-component picker. Renders preset chips; "Custom" reveals a
 * read-only summary of the from/to values (no client-side date input —
 * a custom range arrives via direct URL navigation, or a separate
 * client-component picker layered on this).
 */
export function DateRangePicker({
  basePath,
  state,
  preservedParams = {},
}: {
  basePath: string;
  state: DateRangePickerState;
  /** Extra ?key=value pairs to keep on every chip's href (e.g. tab=expenses) */
  preservedParams?: Record<string, string | undefined>;
}) {
  const buildHref = (preset: DateRangePreset): string => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(preservedParams)) {
      if (v !== undefined && v !== "") params.set(k, v);
    }
    if (preset === "custom") {
      // Preserve current from/to for the "Custom" chip — the only way it
      // makes sense is if there's a custom range already in the URL.
      params.set("range", "custom");
      params.set("from", state.range.from);
      params.set("to", state.range.to);
    } else {
      params.set("range", preset);
    }
    const qs = params.toString();
    return `${basePath}${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="flex flex-wrap items-baseline gap-2">
      {DATE_RANGE_PRESET_ORDER.map((p) => {
        const active = p === state.preset;
        const disabled = p === "custom" && state.preset !== "custom";
        const className =
          "rounded-md px-3 py-1.5 text-xs transition-colors " +
          (active
            ? "bg-zinc-100 text-zinc-900 font-medium"
            : disabled
              ? "border border-zinc-900 text-zinc-600 cursor-not-allowed"
              : "border border-zinc-800 text-zinc-300 hover:border-zinc-700");
        if (disabled) {
          // "Custom" chip without an active custom range is not actionable
          // — needs explicit from/to to be set. Render as inert hint.
          return (
            <span key={p} className={className} title="Pass ?from=&to= in the URL to use a custom range">
              {DATE_RANGE_PRESET_LABELS[p]}
            </span>
          );
        }
        return (
          <Link key={p} href={buildHref(p)} className={className}>
            {DATE_RANGE_PRESET_LABELS[p]}
          </Link>
        );
      })}
      <span className="ml-2 text-xs text-zinc-500 tabular-nums">
        {state.range.from} → {state.range.to}
      </span>
    </div>
  );
}
