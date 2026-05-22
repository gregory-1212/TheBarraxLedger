import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Hardened proxy/middleware. Goals:
//   1. Never crash the whole site if env vars are missing or auth is slow.
//   2. Mirror the DB-side is_staff() allowlist (002_is_staff.sql).
//
// Failure modes that previously caused MIDDLEWARE_INVOCATION_FAILED:
//   - Missing env var → createServerClient receives undefined → throws
//   - Network blip on supabase.auth.getUser() → unhandled rejection
// Both now caught + redirected to /login or passed through (depending on path).

const STAFF_EMAILS = new Set<string>([
  "greg@thebarrax.com",
  "julie@thebarrax.com",
]);

const PUBLIC_PATH_PREFIXES = ["/login", "/auth/"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATH_PREFIXES.some((p) => pathname.startsWith(p));
}

function redirectToLogin(request: NextRequest, errorKey?: string): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  if (errorKey) url.searchParams.set("error", errorKey);
  return NextResponse.redirect(url);
}

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Env vars — accept either name. Original scaffold used PUBLISHABLE_KEY;
  // ANON_KEY is the older Supabase convention. Either is fine; check both.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // If env is missing entirely, fail open on public paths so /login at least
  // renders (so the user sees the actual error message), and redirect everything
  // else to /login with a clear error code.
  if (!supabaseUrl || !supabaseKey) {
    console.error(
      "[proxy] Supabase env vars missing — NEXT_PUBLIC_SUPABASE_URL or " +
        "NEXT_PUBLIC_SUPABASE_{PUBLISHABLE,ANON}_KEY",
    );
    if (isPublicPath(pathname)) {
      return NextResponse.next({ request });
    }
    return redirectToLogin(request, "config_error");
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        } catch (err) {
          console.error("[proxy] cookie setAll failed:", err);
        }
      },
    },
  });

  // Auth lookup. Wrapped because network errors or token-parse errors here
  // shouldn't take down the whole site.
  let user: { email?: string | null } | null = null;
  try {
    const result = await supabase.auth.getUser();
    user = result.data?.user ?? null;
  } catch (err) {
    console.error("[proxy] supabase.auth.getUser threw:", err);
    // On lookup failure: let public paths through, push everything else to /login.
    if (isPublicPath(pathname)) return supabaseResponse;
    return redirectToLogin(request, "auth_unavailable");
  }

  if (!user && !isPublicPath(pathname)) {
    return redirectToLogin(request);
  }

  if (user && !STAFF_EMAILS.has(user.email ?? "")) {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("[proxy] signOut on disallowed email failed:", err);
    }
    return redirectToLogin(request, "not_authorized");
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
