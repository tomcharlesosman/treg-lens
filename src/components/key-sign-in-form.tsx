"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
} from "lucide-react";

export default function KeySignInForm({
  compact = false,
}: {
  compact?: boolean;
}) {
  const id = useId();
  const router = useRouter();
  const [token, setToken] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/session", { signal: controller.signal, cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (!controller.signal.aborted)
          setAuthenticated(data.authenticated === true);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !token.trim()) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim() }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error || "We couldn’t verify that key. Please try again.",
        );
      setToken("");
      router.replace("/app");
      router.refresh();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Connection failed. Please try again.",
      );
      setBusy(false);
    }
  }
  if (authenticated)
    return (
      <div className={`key-signin ${compact ? "is-compact" : ""}`}>
        <div className="key-session-ready">
          <Check size={16} />
          <span>Your Treg session is ready.</span>
        </div>
        <Link href="/app" className="marketing-button green">
          Open your workspace <ArrowRight size={16} />
        </Link>
        <button
          className="key-other-account"
          onClick={() => setAuthenticated(false)}
        >
          Use a different API key
        </button>
      </div>
    );
  return (
    <form
      className={`key-signin ${compact ? "is-compact" : ""}`}
      onSubmit={signIn}
    >
      <label htmlFor={`${id}-key`}>
        {compact ? "YOUR TREG API KEY" : "Treg API key"}
      </label>
      <div className="key-input-group">
        <KeyRound size={17} />
        <input
          id={`${id}-key`}
          name="apiKey"
          type={visible ? "text" : "password"}
          value={token}
          onChange={(e) => {
            setToken(e.target.value);
            if (error) setError("");
          }}
          placeholder="Paste your Treg API key"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={1024}
          required
          disabled={busy}
          aria-describedby={`${id}-privacy${error ? " " + id + "-error" : ""}`}
        />
        <button
          type="button"
          className="key-reveal"
          aria-label={visible ? "Hide API key" : "Show API key"}
          onClick={() => setVisible(!visible)}
          disabled={busy}
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
        {compact && (
          <button
            type="submit"
            className="key-submit-compact"
            disabled={busy || !token.trim()}
            aria-label="Verify key and open workspace"
          >
            {busy ? (
              <LoaderCircle size={18} className="marketing-spin" />
            ) : (
              <ArrowRight size={18} />
            )}
          </button>
        )}
      </div>
      {error && (
        <p id={`${id}-error`} className="key-error" role="alert">
          {error}
        </p>
      )}
      {!compact && (
        <button
          type="submit"
          className="marketing-button green key-submit"
          disabled={busy || !token.trim()}
        >
          {busy ? (
            <>
              <LoaderCircle size={17} className="marketing-spin" /> Verifying
              your key…
            </>
          ) : (
            <>
              Open my workspace <ArrowRight size={17} />
            </>
          )}
        </button>
      )}
      <p id={`${id}-privacy`} className="key-privacy">
        <LockKeyhole size={11} />
        {compact
          ? "Your key. Your credits. No extra account."
          : "Your key is verified with Treg and protected in an encrypted session."}
      </p>
      {!compact && (
        <p className="key-get-token">
          Need a key?{" "}
          <a href="https://treg.to/app" target="_blank" rel="noreferrer">
            Get one from Treg <ArrowRight size={11} />
          </a>
        </p>
      )}
    </form>
  );
}
