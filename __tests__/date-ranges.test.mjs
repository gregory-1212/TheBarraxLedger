// LED-52: smoke test for date-range preset resolution.
//
// Pins the boundary behavior — quarters land on Jan 1 / Apr 1 / Jul 1 / Oct 1,
// "this month" covers the full calendar month not "last 30 days", year
// wrap-around for "last month" + "last quarter" works.

import {
  resolvePreset,
  detectPreset,
} from "../utils/date-ranges.ts";

let failures = 0;
function eq(actual, expected, msg) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures++;
    console.error(
      `  ✗ ${msg}\n      expected: ${JSON.stringify(expected)}\n      actual:   ${JSON.stringify(actual)}`,
    );
  } else {
    console.log(`  ✓ ${msg}`);
  }
}
function section(name) {
  console.log(`\n${name}`);
}

// Anchor: 2026-05-23 (matches Today in the working environment, but the
// tests pin it explicitly so they're date-independent).
const today = new Date(2026, 4, 23); // month 4 = May

section("resolvePreset — mid-quarter anchor (2026-05-23)");
eq(
  resolvePreset("this-month", { today }),
  { from: "2026-05-01", to: "2026-05-31" },
  "this-month: full calendar May",
);
eq(
  resolvePreset("last-month", { today }),
  { from: "2026-04-01", to: "2026-04-30" },
  "last-month: full calendar April (30 days)",
);
eq(
  resolvePreset("this-quarter", { today }),
  { from: "2026-04-01", to: "2026-06-30" },
  "this-quarter: Q2 (Apr–Jun)",
);
eq(
  resolvePreset("last-quarter", { today }),
  { from: "2026-01-01", to: "2026-03-31" },
  "last-quarter: Q1 (Jan–Mar)",
);
eq(
  resolvePreset("ytd", { today }),
  { from: "2026-01-01", to: "2026-05-23" },
  "ytd: Jan 1 → today",
);
eq(
  resolvePreset("last-year", { today }),
  { from: "2025-01-01", to: "2025-12-31" },
  "last-year: full prior calendar year",
);

section("resolvePreset — January anchor (year/quarter wrap)");
const jan = new Date(2026, 0, 15);
eq(
  resolvePreset("last-month", { today: jan }),
  { from: "2025-12-01", to: "2025-12-31" },
  "last-month from January → December of previous year",
);
eq(
  resolvePreset("last-quarter", { today: jan }),
  { from: "2025-10-01", to: "2025-12-31" },
  "last-quarter from Q1 → Q4 of previous year",
);

section("resolvePreset — leap-year February");
const leapFeb = new Date(2024, 1, 10);
eq(
  resolvePreset("this-month", { today: leapFeb }),
  { from: "2024-02-01", to: "2024-02-29" },
  "Feb 2024 has 29 days",
);

section("resolvePreset — custom passthrough");
eq(
  resolvePreset("custom", { from: "2026-03-15", to: "2026-04-15", today }),
  { from: "2026-03-15", to: "2026-04-15" },
  "custom returns the from/to args verbatim",
);

section("detectPreset — hydration round-trip");
const ranges = ["this-month", "last-month", "this-quarter", "last-quarter", "ytd", "last-year"];
for (const p of ranges) {
  const resolved = resolvePreset(p, { today });
  eq(
    detectPreset(resolved, today),
    p,
    `${p} resolves and round-trips`,
  );
}
eq(
  detectPreset({ from: "2026-02-13", to: "2026-04-17" }, today),
  "custom",
  "non-preset range detects as custom",
);

section("Result");
if (failures > 0) {
  console.error(`\n✗ ${failures} assertion(s) failed.`);
  process.exit(1);
}
console.log("\n✓ all date-range assertions passed.");
