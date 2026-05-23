// LED-32: Year-end categorized expense CSV.
//
// Exports every paid bill in a calendar year, one row per bill, with
// vendor + category + amount + payment method + receipt pointer + notes.
// The CPA uses this as their "all expenses for the year, sorted by
// category" worksheet — what would otherwise be a hand-tallied spreadsheet.
//
// Format invariants (pinned by LED-53 contract test):
//   - Dates ISO `YYYY-MM-DD`
//   - Amounts: bare decimals "0.00", no $, no thousands `,`, no `()` for negatives
//   - LF line endings, no BOM
//   - RFC 4180 quoting

export const CATEGORIZED_EXPENSE_COLUMNS = [
  "Date Paid",
  "Vendor",
  "Category",
  "Tax Treatment",
  "Amount",
  "Payment Method",
  "Receipt",
  "Reference",
  "Notes",
] as const;

export type CategorizedExpenseRow = {
  paidDate: string; // ISO YYYY-MM-DD
  vendorName: string;
  categoryName: string; // "Uncategorized" if the bill has no expense_category_id
  taxTreatment: string; // "deductible" | "non_deductible" | "capital_expense" | ""
  amountDollars: string; // formatted "1234.56" (no $)
  paymentMethod: string;
  receipt: string; // signed URL when receipts ship, else "in archive" or ""
  reference: string;
  notes: string;
};

export function buildCategorizedExpenseCsv(rows: CategorizedExpenseRow[]): string {
  const lines: string[] = [];
  lines.push(CATEGORIZED_EXPENSE_COLUMNS.map(csvField).join(","));
  for (const r of rows) {
    lines.push(
      [
        r.paidDate,
        r.vendorName,
        r.categoryName,
        r.taxTreatment,
        r.amountDollars,
        r.paymentMethod,
        r.receipt,
        r.reference,
        r.notes,
      ]
        .map(csvField)
        .join(","),
    );
  }
  return lines.join("\n");
}

function csvField(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s === "") return "";
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Cents → bare dollar string suitable for CSV amount columns.
 * "0.00", "1234.56", "-50.00" (leading sign). No $, no commas, no parens.
 */
export function centsToCsvDollars(cents: number): string {
  if (!Number.isFinite(cents)) return "0.00";
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  const dollars = Math.floor(abs / 100);
  const remainder = abs % 100;
  return `${sign}${dollars}.${remainder.toString().padStart(2, "0")}`;
}
