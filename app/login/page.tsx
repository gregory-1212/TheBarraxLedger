"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const params = useSearchParams();
  const queryError = params.get("error");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setLoading(false);
    if (signInError) {
      setError(signInError.message);
    } else {
      setSent(true);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-100">
            The Barrax Ledger
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Staff sign-in via email link.
          </p>
        </div>

        {queryError === "not_authorized" && (
          <div className="mb-4 rounded-md border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-200">
            That email address isn&apos;t authorized for the Ledger.
          </div>
        )}
        {queryError === "auth_failed" && (
          <div className="mb-4 rounded-md border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-200">
            Sign-in link expired or invalid. Request a new one.
          </div>
        )}

        {sent ? (
          <div className="rounded-md border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-sm text-zinc-300">
            Sent. Check{" "}
            <span className="text-zinc-100 font-medium">{email}</span> for a
            sign-in link.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="email"
              required
              autoFocus
              autoComplete="email"
              placeholder="you@thebarrax.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-zinc-700"
            />
            {error && (
              <div className="text-xs text-red-400" role="alert">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={loading || !email}
              className="w-full rounded-md bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Sending…" : "Send sign-in link"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
