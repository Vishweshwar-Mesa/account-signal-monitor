"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

export default function LoginForm({ testMode, demoEmail }: { testMode: boolean; demoEmail: string }) {
  const [email, setEmail] = useState(testMode ? demoEmail : "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (testMode) {
        const r = await fetch("/api/test-login", { method: "POST" });
        if (!r.ok) throw new Error("test sign-in failed");
      } else {
        const { error } = await supabaseBrowser().auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      window.location.href = "/";
    } catch {
      setError("Sign in failed. Check the work email and passcode.");
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block text-sm font-semibold">Work email
        <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full min-h-[44px] px-3 rounded-[8px] border border-border bg-surface text-text font-normal" />
      </label>
      {!testMode && <label className="block text-sm font-semibold">Passcode
        <input type="password" autoComplete="current-password" required={!testMode} value={password} onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full min-h-[44px] px-3 rounded-[8px] border border-border bg-surface text-text font-normal" />
      </label>}
      {error && <p role="alert" className="text-sm text-hot">{error}</p>}
      <button type="submit" className="btn btn-primary w-full" disabled={busy}>{busy ? "Signing in" : "Sign in"}</button>
    </form>
  );
}
