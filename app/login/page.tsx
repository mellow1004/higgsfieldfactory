"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";

export default function LoginPage() {
  const [username, setUsername] = useState("factory");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Login failed");
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen grid place-items-center px-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-2xl border border-line bg-panel p-8 shadow-[0_20px_80px_rgba(0,0,0,0.35)]"
      >
        <div className="mb-6 flex items-center gap-3">
          <Image src="/logo.svg" alt="" width={40} height={40} />
          <div>
            <p className="font-mono text-[11px] tracking-[0.22em] text-brass uppercase">
              Internal
            </p>
            <h1 className="text-xl font-semibold tracking-tight">Higgsfield Factory</h1>
          </div>
        </div>
        <label className="block text-sm text-muted mb-1">Username</label>
        <input
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          className="mb-4 w-full rounded-lg border border-line bg-panel-2 px-3 py-2"
          autoComplete="username"
        />
        <label className="block text-sm text-muted mb-1">Password</label>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mb-5 w-full rounded-lg border border-line bg-panel-2 px-3 py-2"
          autoComplete="current-password"
        />
        {error ? <p className="mb-4 text-sm text-bad">{error}</p> : null}
        <button
          disabled={busy}
          className="w-full rounded-lg bg-brass py-2.5 font-medium text-[#1a1406] disabled:opacity-60"
        >
          {busy ? "Signing in…" : "Enter the floor"}
        </button>
        <p className="mt-4 text-xs text-muted">
          Default local login is <code>factory</code> / <code>factory</code>. Change it with
          env vars before deploying.
        </p>
      </form>
    </main>
  );
}
