"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function BookingTestSignIn() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const supabase = createClient();
    const auth = await supabase.auth.signInWithPassword({ email, password });
    if (auth.error || !auth.data.user || auth.data.user.is_anonymous) {
      setError("The booking test account could not be authenticated.");
      setBusy(false);
      return;
    }
    const allowed = await supabase.rpc("can_use_booking_testing");
    if (allowed.error || !allowed.data) {
      await supabase.auth.signOut();
      setError("This account has no active booking-test authorization.");
      setBusy(false);
      return;
    }
    router.push("/motorcycles");
    router.refresh();
  }
  return (
    <form onSubmit={signIn} className="mt-7 space-y-4">
      <input
        required
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Authorized tester email"
        autoComplete="username"
        className="field"
      />
      <input
        required
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        autoComplete="current-password"
        className="field"
      />
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      <button
        disabled={busy}
        className="bg-ocean disabled:bg-sand disabled:text-muted w-full rounded-xl px-5 py-3 font-bold text-white disabled:opacity-100"
      >
        {busy ? "Verifying…" : "Sign in for synthetic testing"}
      </button>
    </form>
  );
}
