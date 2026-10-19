/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, GitFork, ShieldCheck } from "lucide-react";
import KeySignInForm from "@/components/key-sign-in-form";
import { MarketingLogo } from "@/components/marketing-page";
import { GITHUB_FORK_URL } from "@/lib/site";
import "@/components/marketing.css";
export const metadata: Metadata = {
  title: "Log in — Treg Lens",
  description:
    "Sign in to your AI visibility workspace with your Treg API key.",
};
export default function Login() {
  return (
    <div className="marketing-page signin-page">
      <header className="signin-header">
        <MarketingLogo />
        <Link href="/" className="signin-back">
          <ArrowLeft size={13} /> Back to the bigger picture
        </Link>
      </header>
      <main className="signin-layout">
        <section className="signin-story">
          <div className="signin-story-grid" />
          <span className="marketing-eyebrow">
            A LITTLE CONTEXT. A CLEARER PICTURE.
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
          <div className="signin-story-engines">
            {["chatgpt", "perplexity", "gemini", "google"].map((engine) => (
              <span key={engine}>
                <img
                  src={`/engines/${engine}.svg`}
                  alt={engine === "google" ? "Google AI Mode" : engine}
                  width={24}
                  height={24}
                />
              </span>
            ))}
          </div>
          <footer>
            <span>
              <ShieldCheck size={14} /> YOUR KEY. YOUR WORKSPACE.
            </span>
            <span>[ A CLEARER PERSPECTIVE ]</span>
          </footer>
        </section>
        <section className="signin-form-panel">
          <div>
            <span className="marketing-eyebrow">
              <span className="marketing-status-dot" /> WELCOME TO TREG LENS
            </span>
            <h2>
              Let’s bring your
              <br />
              brand into focus.
            </h2>
            <p>
              Paste your Treg API key to open your workspace.
              <br />
              No extra account or password to remember.
            </p>
            <KeySignInForm />
            <div className="signin-form-divider">
              <span>or take your own path</span>
            </div>
            <div className="signin-secondary">
              <Link href="/demo">
                Preview sample data <ArrowUpRight size={13} />
              </Link>
              <a href={GITHUB_FORK_URL} target="_blank" rel="noreferrer">
                <GitFork size={14} /> Fork the repo <ArrowUpRight size={13} />
              </a>
            </div>
          </div>
          <footer>
            Open source. Powered by{" "}
            <a href="https://treg.to/aeo" target="_blank" rel="noreferrer">
              treg <ArrowUpRight size={10} />
            </a>
            .
          </footer>
        </section>
      </main>
    </div>
  );
}
