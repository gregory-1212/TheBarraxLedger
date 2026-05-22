import Link from "next/link";
import { createClient } from "@/utils/supabase/server";

// LED-9: Compliance scorecard — per-jurisdiction pills + overall roll-up.
// ZenBusiness pattern (Good / At-Risk / Overdue) from research/compliance.md.

type JurisdictionStats = {
  jurisdiction: string;
  label: string;
  total: number;
  overdue: number;
  dueSoon: number;
  done: number;
  health: "good" | "at_risk" | "overdue" | "empty";
};

const JURISDICTIONS = [
  { value: "FED", label: "Federal" },
  { value: "NV", label: "Nevada" },
  { value: "TN", label: "Tennessee" },
  { value: "DAVIDSON_COUNTY", label: "Davidson" },
  { value: "CITY_OF_NASHVILLE", label: "Nashville" },
];

const HEALTH_CLASSES: Record<JurisdictionStats["health"], string> = {
  good: "bg-emerald-950/40 border-emerald-800/60 text-emerald-200",
  at_risk: "bg-amber-950/40 border-amber-800/60 text-amber-200",
  overdue: "bg-red-950/40 border-red-800/60 text-red-200",
  empty: "bg-zinc-900 border-zinc-800 text-zinc-500",
};

const HEALTH_LABELS: Record<JurisdictionStats["health"], string> = {
  good: "Good",
  at_risk: "At risk",
  overdue: "Overdue",
  empty: "—",
};

function deriveHealth(s: {
  total: number;
  overdue: number;
  dueSoon: number;
}): JurisdictionStats["health"] {
  if (s.total === 0) return "empty";
  if (s.overdue > 0) return "overdue";
  if (s.dueSoon > 0) return "at_risk";
  return "good";
}

type Variant = "compact" | "full";

export async function ComplianceScorecard({
  variant = "compact",
}: {
  variant?: Variant;
}) {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const in30 = new Date();
  in30.setDate(in30.getDate() + 30);
  const in30Iso = in30.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("compliance_items")
    .select("jurisdiction, status, next_due_date")
    .is("deleted_at", null);

  if (error || !data) return null;

  // Tally per jurisdiction
  const tally = new Map<string, { total: number; overdue: number; dueSoon: number; done: number }>();
  for (const j of JURISDICTIONS) {
    tally.set(j.value, { total: 0, overdue: 0, dueSoon: 0, done: 0 });
  }

  for (const row of data) {
    const stats = tally.get(row.jurisdiction);
    if (!stats) continue;
    stats.total++;
    if (row.status === "done") {
      stats.done++;
    } else if (row.next_due_date < today) {
      stats.overdue++;
    } else if (row.next_due_date <= in30Iso) {
      stats.dueSoon++;
    }
  }

  const stats: JurisdictionStats[] = JURISDICTIONS.map((j) => {
    const t = tally.get(j.value)!;
    return {
      jurisdiction: j.value,
      label: j.label,
      ...t,
      health: deriveHealth(t),
    };
  });

  // Overall roll-up
  const overall = stats.reduce(
    (acc, s) => ({
      total: acc.total + s.total,
      overdue: acc.overdue + s.overdue,
      dueSoon: acc.dueSoon + s.dueSoon,
      done: acc.done + s.done,
    }),
    { total: 0, overdue: 0, dueSoon: 0, done: 0 },
  );
  const overallHealth = deriveHealth(overall);

  if (overall.total === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-800 bg-zinc-950 px-4 py-3 text-xs text-zinc-500">
        Compliance scorecard appears here once items exist.
      </div>
    );
  }

  return (
    <div>
      {variant === "full" && (
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs uppercase tracking-wide text-zinc-500 font-medium">
            Compliance Scorecard
          </p>
          <p
            className={`text-xs px-2 py-0.5 rounded-md border ${HEALTH_CLASSES[overallHealth]}`}
          >
            Overall: {HEALTH_LABELS[overallHealth]}
            {overall.overdue > 0 && ` · ${overall.overdue} overdue`}
            {overall.overdue === 0 && overall.dueSoon > 0 && ` · ${overall.dueSoon} due in 30d`}
          </p>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {stats.map((s) => {
          const href =
            s.total > 0 ? `/compliance?jurisdiction=${s.jurisdiction}` : undefined;
          const content = (
            <div
              className={
                "rounded-md border px-3 py-2 text-xs " +
                HEALTH_CLASSES[s.health] +
                (href ? " hover:opacity-80 transition-opacity" : "")
              }
            >
              <p className="font-medium">{s.label}</p>
              <p className="opacity-80">
                {s.total === 0
                  ? "no items"
                  : s.overdue > 0
                    ? `${s.overdue} overdue`
                    : s.dueSoon > 0
                      ? `${s.dueSoon} due in 30d`
                      : `${s.total} on track`}
              </p>
            </div>
          );
          if (href) {
            return (
              <Link key={s.jurisdiction} href={href}>
                {content}
              </Link>
            );
          }
          return <div key={s.jurisdiction}>{content}</div>;
        })}
      </div>
    </div>
  );
}
