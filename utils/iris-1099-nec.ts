// LED-28: IRS IRIS-format 1099-NEC CSV generation.
//
// Builds a CSV matching the IRS IRIS portal's 1099-NEC template. We aim at
// IRIS (not the deprecated FIRE format) because FIRE retires after FY2026
// and IRIS becomes the only IRS direct intake from 2027 onward.
//
// Greg's CPA performs the actual filing. Our output is a working artifact:
// every contractor row contains the data we have, payer info is sourced from
// env vars (left blank if unset), and the CPA fills in anything missing in
// their filing tool. Column order tracks the IRS-published IRIS 1099-NEC
// template — verify against the current year's template at
// https://www.irs.gov/filing/e-file-information-returns-with-iris before
// filing.

// Canonical IRIS 1099-NEC CSV column order. Stored as a tuple so callers
// can't accidentally rearrange — and so LED-53's contract test can pin it.
export const IRIS_1099_NEC_COLUMNS = [
  "Tax Year",
  "Payer TIN",
  "Payer Name",
  "Payer Address Line 1",
  "Payer Address Line 2",
  "Payer City",
  "Payer State",
  "Payer ZIP",
  "Payer Country Code",
  "Payer Phone",
  "Recipient TIN Type",
  "Recipient TIN",
  "Recipient Name Line 1",
  "Recipient Name Line 2",
  "Recipient Address Line 1",
  "Recipient Address Line 2",
  "Recipient City",
  "Recipient State",
  "Recipient ZIP",
  "Recipient Country Code",
  "Recipient Account Number",
  "Box 1 Nonemployee Compensation",
  "Box 2 Direct Sales Indicator",
  "Box 4 Federal Income Tax Withheld",
  "State Tax Withheld",
  "State / Payer State No.",
  "State Income",
  "Second TIN Notice",
  "FATCA Filing Requirement",
] as const;

export type IrisPayer = {
  name: string;
  tin: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  zip: string;
  countryCode: string; // "US" for domestic
  phone: string;
};

export type IrisRecipient = {
  // From vendors row
  name: string;
  nameLine2?: string; // dba or trade name
  tin: string; // decrypted at call time; empty string if not on file
  tinType: "EIN" | "SSN" | ""; // empty if unknown
  // billing_address is a single text blob in Ledger; goes into Line 1 unless
  // the caller has parsed it.
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  zip: string;
  countryCode: string;
  accountNumber: string; // optional internal ref; can be vendor.id
  // Box 1: nonemployee comp in dollars (string formatted "0.00")
  nonemployeeCompensation: string;
  // Backup withholding withheld (Box 4), dollars. Empty/"0.00" for most rows.
  federalIncomeTaxWithheld: string;
  directSalesIndicator: boolean; // Box 2: $5,000+ direct sales of consumer products
  secondTinNotice: boolean;
  fatcaFilingRequirement: boolean;
};

/**
 * Build the IRIS 1099-NEC CSV string from structured inputs.
 *
 * Format invariants enforced (pinned by LED-53 contract test):
 *   - LF line endings, not CRLF
 *   - No BOM
 *   - Header row matches IRIS_1099_NEC_COLUMNS exactly
 *   - Amount columns are bare decimals: `/^-?\d+\.\d{2}$/`, no `$`, no thousands `,`, no `()` for negatives
 *   - Dates: there are no date columns in IRIS 1099-NEC besides tax year (4-digit integer)
 *   - Fields containing `,` `"` or newline are wrapped and inner quotes doubled per RFC 4180
 */
export function buildIris1099NecCsv(
  taxYear: number,
  payer: IrisPayer,
  recipients: IrisRecipient[],
): string {
  const lines: string[] = [];
  lines.push(IRIS_1099_NEC_COLUMNS.map(csvField).join(","));

  for (const r of recipients) {
    const row = [
      String(taxYear),
      payer.tin,
      payer.name,
      payer.addressLine1,
      payer.addressLine2,
      payer.city,
      payer.state,
      payer.zip,
      payer.countryCode,
      payer.phone,
      r.tinType,
      r.tin,
      r.name,
      r.nameLine2 ?? "",
      r.addressLine1,
      r.addressLine2,
      r.city,
      r.state,
      r.zip,
      r.countryCode,
      r.accountNumber,
      r.nonemployeeCompensation,
      r.directSalesIndicator ? "1" : "",
      r.federalIncomeTaxWithheld,
      "", // State Tax Withheld — TN has no income tax
      "", // State / Payer State No. — empty for TN
      "", // State Income — empty for TN
      r.secondTinNotice ? "1" : "",
      r.fatcaFilingRequirement ? "1" : "",
    ];
    lines.push(row.map(csvField).join(","));
  }

  return lines.join("\n");
}

// RFC 4180 quoting: wrap if field contains `,` `"` `\n` `\r`; double inner
// quotes. Falsy/null/undefined render as empty string.
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
 * Format cents as a bare 2-decimal string suitable for IRIS amount columns.
 * No `$`, no thousands separator, no `()` for negatives — IRIS rejects those.
 */
export function centsToIrisAmount(cents: number): string {
  if (!Number.isFinite(cents)) return "0.00";
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  const dollars = Math.floor(abs / 100);
  const remainder = abs % 100;
  return `${sign}${dollars}.${remainder.toString().padStart(2, "0")}`;
}

/**
 * Read payer info from env vars. Missing vars render as empty strings — the
 * CSV is still valid; the CPA fills missing payer fields in their tool, OR
 * Greg sets the env vars in Vercel before the next export.
 *
 * Required for a complete export:
 *   LEDGER_PAYER_NAME
 *   LEDGER_PAYER_TIN
 *   LEDGER_PAYER_ADDRESS_LINE1
 *   LEDGER_PAYER_CITY
 *   LEDGER_PAYER_STATE
 *   LEDGER_PAYER_ZIP
 *
 * Optional:
 *   LEDGER_PAYER_ADDRESS_LINE2
 *   LEDGER_PAYER_PHONE
 *   LEDGER_PAYER_COUNTRY_CODE (defaults to "US")
 */
export function payerFromEnv(): IrisPayer {
  return {
    name: process.env.LEDGER_PAYER_NAME ?? "",
    tin: process.env.LEDGER_PAYER_TIN ?? "",
    addressLine1: process.env.LEDGER_PAYER_ADDRESS_LINE1 ?? "",
    addressLine2: process.env.LEDGER_PAYER_ADDRESS_LINE2 ?? "",
    city: process.env.LEDGER_PAYER_CITY ?? "",
    state: process.env.LEDGER_PAYER_STATE ?? "",
    zip: process.env.LEDGER_PAYER_ZIP ?? "",
    countryCode: process.env.LEDGER_PAYER_COUNTRY_CODE ?? "US",
    phone: process.env.LEDGER_PAYER_PHONE ?? "",
  };
}

/**
 * Map vendors.business_classification to the IRIS Recipient TIN Type.
 * Returns empty string when the classification doesn't imply a TIN type
 * (e.g. "other") — the CPA will resolve before filing.
 */
export function tinTypeForClassification(
  classification: string | null | undefined,
): "EIN" | "SSN" | "" {
  switch (classification) {
    case "individual":
    case "sole_proprietorship":
      return "SSN";
    case "llc":
    case "c_corporation":
    case "s_corporation":
    case "partnership":
    case "tax_exempt":
      return "EIN";
    default:
      return "";
  }
}
