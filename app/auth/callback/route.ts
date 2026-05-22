import { type NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/server";

// Supabase sends magic-link clicks here. Two flows are possible:
//   PKCE (?code=...)         — used when the link was issued from the browser
//   Token-hash (?token_hash=&type=email)
// We handle both and redirect to / on success, /login on failure.
export async function GET(request: NextRequest) {
  const url = request.nextUrl.clone();
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      url.pathname = "/login";
      url.search = "";
      url.searchParams.set("error", "auth_failed");
      return NextResponse.redirect(url);
    }
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (error) {
      url.pathname = "/login";
      url.search = "";
      url.searchParams.set("error", "auth_failed");
      return NextResponse.redirect(url);
    }
  } else {
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Allowlist enforcement happens in middleware on the redirect.
  url.pathname = "/";
  url.search = "";
  return NextResponse.redirect(url);
}
