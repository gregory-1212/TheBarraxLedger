import { type NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/server";

// Supabase sends magic-link clicks here. Two server-handlable flows:
//   PKCE (?code=...)
//   Token-hash (?token_hash=&type=email|magiclink|recovery|invite|email_change)
//
// Implicit flow (#access_token=... in URL hash) is NOT handled here — that
// arrives only client-side. If we ever see neither code nor token_hash, the
// link is using implicit flow and we redirect to /login with a hint.
export async function GET(request: NextRequest) {
  const url = request.nextUrl.clone();
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  const supabase = await createClient();

  function failTo(errorKey: string, detail?: string): NextResponse {
    const out = request.nextUrl.clone();
    out.pathname = "/login";
    out.search = "";
    out.searchParams.set("error", errorKey);
    if (detail) {
      // Cap detail length so it can't blow up the URL.
      out.searchParams.set("detail", detail.slice(0, 200));
    }
    return NextResponse.redirect(out);
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("[auth/callback] exchangeCodeForSession failed:", error);
      return failTo("auth_failed", `exchange: ${error.message}`);
    }
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (error) {
      console.error("[auth/callback] verifyOtp failed:", error);
      return failTo("auth_failed", `verifyOtp(${type}): ${error.message}`);
    }
  } else {
    // No server-readable token. Most likely implicit flow (#tokens in hash).
    return failTo("missing_token");
  }

  // Allowlist enforcement happens in middleware on the redirect.
  url.pathname = "/";
  url.search = "";
  return NextResponse.redirect(url);
}
