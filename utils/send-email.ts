// LED-12 + LED-21: minimal Resend wrapper for transactional emails.
//
// We use Resend's REST API directly (no SDK) to avoid an extra dependency.
// Same Resend account that powers Supabase Auth's magic-link SMTP; the API
// key is set as RESEND_API_KEY in Vercel project env. If unset, sends
// no-op + log — the caller doesn't crash and the cron can still progress.

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_FROM = "The Barrax Ledger <noreply@thebarrax.com>";

export type SendEmailParams = {
  to: string[];
  subject: string;
  html: string;
  /** Plain-text fallback. Required by most spam filters. */
  text: string;
  from?: string;
  /** Reply-to address (optional — defaults to omitted). */
  replyTo?: string;
};

export type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped: false; error: string; status?: number };

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(
      "[send-email] RESEND_API_KEY not set — would have sent to",
      params.to.join(", "),
      "subject:",
      params.subject,
    );
    return { ok: false, skipped: true, reason: "RESEND_API_KEY not set" };
  }

  const body: Record<string, unknown> = {
    from: params.from ?? DEFAULT_FROM,
    to: params.to,
    subject: params.subject,
    html: params.html,
    text: params.text,
  };
  if (params.replyTo) body.reply_to = params.replyTo;

  let resp: Response;
  try {
    resp = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return {
      ok: false,
      skipped: false,
      error: `network: ${(e as Error).message}`,
    };
  }

  if (!resp.ok) {
    let errBody = "";
    try {
      errBody = await resp.text();
    } catch {
      // ignore
    }
    return {
      ok: false,
      skipped: false,
      error: `resend ${resp.status}: ${errBody.slice(0, 300)}`,
      status: resp.status,
    };
  }

  const json = (await resp.json().catch(() => ({}))) as { id?: string };
  return { ok: true, id: json.id ?? "(no id)" };
}
