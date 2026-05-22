import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client. Use from client components.
// Respects RLS via the anon/publishable key.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
