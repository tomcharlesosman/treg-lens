/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, GitFork } from "lucide-react";
import KeySignInForm from "@/components/key-sign-in-form";
import MarketingLogo from "@/components/marketing-logo";
import { GITHUB_FORK_URL } from "@/lib/site";
import "@/components/marketing.css";
import "@/components/landing.css";
export const metadata: Metadata = {
  title: "Log in — Treg Lens",
  description:
    "Sign in to your AI visibility workspace with your Treg API key.",
};
const engines = [
  { id: "chatgpt", name: "ChatGPT" },
  { id: "perplexity", name: "Perplexity" },
  { id: "gemini", name: "Gemini" },
  { id: "google", name: "Google AI Mode" },
];
function Pixel() {
  return (
    <span className="ll-pixel" aria-hidden="true">
      <i />
      <i />
    </span>
  );
}
// Shares the landing page's tokens (.lens-landing) and dark key box; the
// sign-in layout itself lives in marketing.css under .signin-*.
export default function Login() {
  return (
    <div className="lens-landing signin-page">
      <div className="signin-backdrop" aria-hidden="true" />
      <header className="signin-header">
        <MarketingLogo />
        <Link href="/" className="ll-ghost signin-back">
          <ArrowLeft size={14} />
          <span>
            Back<span className="signin-back-rest"> to the bigger picture</span>
          </span>
        </Link>
      </header>
      <main className="signin-layout">
        <section className="signin-story">
          <span className="ll-kicker">
            <Pixel /> A little context. A clearer picture.
          </span>
          <h1>
            One key.
            <br />A whole new
            <br />
            <span>perspective.</span>
          </h1>
          <p>
            Your brand is part of the conversation.
            <br />
            Let’s find out how.
          </p>
          <section className="signin-engines" aria-label="Supported answer engines">
            <span className="ll-ui-label">Asks</span>
            <ul>
              {engines.map((engine) => (
                <li key={engine.id}>
                  <img
                    src={`/engines/${engine.id}.svg`}
                    alt=""
                    width={18}
                    height={18}
                  />
                  <span>{engine.name}</span>
                </li>
              ))}
            </ul>
          </section>
          <ul className="ll-ticks signin-story-ticks">
            <li>Your key. Your workspace.</li>
            <li>A clearer perspective</li>
          </ul>
        </section>
        <section className="signin-form-panel">
          <span className="ll-kicker">
            <span className="signin-live-dot" /> Welcome to Treg Lens
          </span>
          <h2>
            Let’s bring your <br className="signin-break" />
            brand into <span className="ll-mark">focus</span>.
          </h2>
          <p>
            Paste your Treg API key to open your workspace. No extra account
            or password to remember.
          </p>
          <div className="ll-keybox signin-keybox">
            <KeySignInForm />
          </div>
          <div className="signin-form-divider">
            <span>Or take your own path</span>
          </div>
          <div className="signin-secondary">
            <Link href="/demo" className="ll-ghost">
              Preview sample data <ArrowUpRight size={13} />
            </Link>
            <a
              href={GITHUB_FORK_URL}
              target="_blank"
              rel="noreferrer"
              className="ll-ghost"
            >
              <GitFork size={14} /> Fork the repo <ArrowUpRight size={13} />
            </a>
          </div>
          <footer>
            Open source. Powered by{" "}
            <a href="https://treg.to/aeo" target="_blank" rel="noreferrer">
              treg <ArrowUpRight size={12} />
            </a>
          </footer>
        </section>
      </main>
    </div>
  );
}
