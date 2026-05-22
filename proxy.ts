import { type NextRequest } from "next/server";
import { updateSession } from "@/utils/supabase/middleware";

// Next.js 16 renamed the "middleware" file convention to "proxy". This file +
// the exported function name follow the new convention. utils/supabase/middleware.ts
// keeps the old filename for now — it's just the helper module, not the proxy entry.
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
