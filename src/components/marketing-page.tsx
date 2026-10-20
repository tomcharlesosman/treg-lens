/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  Code2,
  Compass,
  Eye,
  GitFork,
  Globe2,
  KeyRound,
  Link2,
  LockKeyhole,
  MessageSquareText,
  Plus,
  ScanLine,
  Sparkles,
  Terminal,
  TrendingUp,
} from "lucide-react";
import KeySignInForm from "./key-sign-in-form";
import { DEPLOY_VERCEL_URL, GITHUB_FORK_URL, GITHUB_REPOSITORY } from "@/lib/site";
import "./marketing.css";

export function MarketingLogo({ light = false }: { light?: boolean }) {
  return (
    <Link
      href="/"
      className={`marketing-logo ${light ? "is-light" : ""}`}
      aria-label="Treg Lens home"
    >
      <span className="marketing-brand-mark">
        <i />
        <i />
      </span>
      <span>
        treg<span>lens</span>
      </span>
    </Link>
  );
}
function EngineIcon({ name }: { name: string }) {
  return <img src={`/engines/${name}.svg`} alt="" width={21} height={21} />;
}
function LensIllustration() {
  return (
    <div
      className="marketing-lens"
      aria-label="Illustration of a brand appearing across four answer engines"
    >
      <div className="ml-grid" />
      <div className="ml-coordinates">
        <span>THE ANSWER ENGINE ERA</span>
        <span>04 ENGINES / 01 WORKSPACE</span>
      </div>
      <div className="ml-ring r1" />
      <div className="ml-ring r2" />
      <div className="ml-ring r3" />
      <div className="ml-orbit o1" />
      <div className="ml-orbit o2" />
      <span className="ml-plus p1">+</span>
      <span className="ml-plus p2">+</span>
      <span className="ml-plus p3">+</span>
      <div className="ml-center">
        <span className="marketing-brand-mark">
          <i />
          <i />
        </span>
        <span>YOU, IN FOCUS.</span>
      </div>
      <span className="ml-engine me1">
        <EngineIcon name="chatgpt" />
        <span>ChatGPT</span>
        <i />
      </span>
      <span className="ml-engine me2">
        <EngineIcon name="perplexity" />
        <span>Perplexity</span>
        <i />
      </span>
      <span className="ml-engine me3">
        <EngineIcon name="gemini" />
        <span>Gemini</span>
        <i />
      </span>
      <span className="ml-engine me4">
        <EngineIcon name="google" />
        <span>AI Mode</span>
        <i />
      </span>
      <div className="ml-answer">
        <span>
          <Sparkles size={13} /> AN ANSWER WORTH UNDERSTANDING
        </span>
        <p>
          “Here are the brands
          <br />
          I’d recommend…”
        </p>
        <div>
          <i />
          <i />
          <i />
        </div>
        <small>See if yours makes the conversation.</small>
      </div>
      <span className="ml-caption">[ CHANGE YOUR PERSPECTIVE ]</span>
      <span className="ml-example">CONCEPTUAL ILLUSTRATION</span>
    </div>
  );
}
const steps = [
  {
    number: "01",
    label: "DISCOVER",
    title: "Start with the right question.",
    description:
      "Find what buyers are already asking with live keyword ideas and Google’s People Also Ask.",
    icon: Compass,
  },
  {
    number: "02",
    label: "MEASURE",
    title: "See who gets recommended.",
    description:
      "Ask four answer engines. Track your mentions, your competitors, and your place in the conversation.",
    icon: ScanLine,
  },
  {
    number: "03",
    label: "UNDERSTAND",
    title: "Follow the trail of sources.",
    description:
      "Explore the pages AI cites, measure their authority, and read the evidence behind the answers.",
    icon: Link2,
  },
  {
    number: "04",
    label: "ACT",
    title: "Make your next move.",
    description:
      "Turn missing mentions into practical writing briefs. Keep a baseline and measure again as you grow.",
    icon: TrendingUp,
  },
];
const questions = [
  {
    q: "How do I get started?",
    a: "Paste an org-scoped Treg API key above. Lens verifies it with Treg without running a paid audit, then opens your workspace. A separate sample preview is available before connecting.",
  },
  {
    q: "Is Treg Lens free?",
    a: "The software is free and MIT licensed. Live research uses your Treg credits and may also incur your own hosting costs. Lens shows a current estimate before you start a paid audit, prompt discovery, or source lookup.",
  },
  {
    q: "Which answer engines can I track?",
    a: "ChatGPT, Gemini, Google AI Mode, and Perplexity. Perplexity uses the Sonar model API; the other three return answers from their web interfaces. Current audits use the United States and English locale.",
  },
  {
    q: "Where do my key and audit data live?",
    a: "Your sign-in key is verified server-side and kept in an encrypted, HTTP-only session cookie. It is never included in exports. Your workspace is saved on your server, separated by API key, with a browser cache for interrupted connections. Export and restore a full JSON backup, or export filtered JSON/CSV reports.",
  },
  {
    q: "Can I host it myself?",
    a: "Yes. Fork the repository, follow the setup guide, and run your own instance. You control the code, your deployment, and your research workflow. The MIT license covers the application code; provider access follows Treg’s terms.",
  },
];

export default function MarketingPage() {
  return (
    <div className="marketing-page">
      <header className="marketing-nav">
        <MarketingLogo />
        <nav aria-label="Marketing navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#the-workspace">The workspace</a>
          <a href="#open-source">
            Open source <ArrowUpRight size={12} />
          </a>
        </nav>
        <div className="marketing-nav-actions">
          <Link href="/login" className="marketing-login">
            Log in <ArrowUpRight size={13} />
          </Link>
          <a
            className="marketing-button small"
            href={GITHUB_FORK_URL}
            target="_blank"
            rel="noreferrer"
          >
            <GitFork size={14} />
            <span>Fork on GitHub</span>
          </a>
        </div>
      </header>
      <main>
        <section className="marketing-hero marketing-wrap" id="connect">
          <div className="marketing-hero-copy">
            <div className="marketing-eyebrow">
              <span className="marketing-status-dot" /> AN OPEN PERSPECTIVE ON
              AI SEARCH
            </div>
            <h1>
              Your brand <br />
              belongs in
              <br /> the{" "}
              <span>
                answer
                <svg
                  viewBox="0 0 330 18"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <path d="M3 13 Q120 -1 324 8 M30 17 Q194 5 306 12" />
                </svg>
              </span>
              .
            </h1>
            <p className="marketing-hero-description">
              See what AI says about you. <br />
              Understand what shapes the answer. <br />
              <strong>Find your next move.</strong>
            </p>
            <div className="marketing-hero-form">
              <KeySignInForm compact />
              <div className="marketing-demo-link">
                <Link href="/demo">
                  Preview sample data <ArrowUpRight size={13} />
                </Link>
                <span>Illustrative data · no key needed.</span>
              </div>
            </div>
            <div className="marketing-hero-footnote">
              <span>
                <Check size={12} /> Open source
              </span>
              <span>
                <Check size={12} /> Pay as you go
              </span>
              <span>
                <Check size={12} /> Yours to run
              </span>
            </div>
          </div>
          <LensIllustration />
        </section>
        <section
          className="marketing-engines marketing-wrap"
          aria-label="Supported answer engines"
        >
          <span>
            ONE BRAND.
            <br />
            FOUR PERSPECTIVES.
          </span>
          <div>
            <EngineIcon name="chatgpt" />
            <strong>ChatGPT</strong>
          </div>
          <div>
            <EngineIcon name="perplexity" />
            <strong>Perplexity</strong>
            <small>Sonar API</small>
          </div>
          <div>
            <EngineIcon name="gemini" />
            <strong>Gemini</strong>
          </div>
          <div>
            <EngineIcon name="google" />
            <strong>Google AI Mode</strong>
          </div>
          <a href="https://treg.to/aeo" target="_blank" rel="noreferrer">
            Powered by treg <ArrowUpRight size={13} />
          </a>
        </section>
        <section className="marketing-intro marketing-wrap" id="how-it-works">
          <div>
            <span className="marketing-eyebrow">
              <span className="marketing-section-index">
                01 / THE OPPORTUNITY
              </span>
            </span>
            <h2>
              Search has changed.
              <br />
              Your perspective should too.
            </h2>
          </div>
          <p>
            Customers are asking AI what to buy, who to trust, and which tools
            to choose. Treg Lens helps you see where your brand shows up—and
            what to do with what you find.
          </p>
        </section>
        <section className="marketing-feature-grid marketing-wrap">
          <article className="marketing-feature feature-mint">
            <span className="feature-icon">
              <Eye size={20} />
            </span>
            <div className="marketing-mini-answer">
              <span>
                <EngineIcon name="chatgpt" /> YOUR CATEGORY, THROUGH AI’S EYES
              </span>
              <div>
                <i>01</i>
                <b>Your brand</b>
                <CheckCheck size={13} />
              </div>
              <div>
                <i>02</i>
                <b>The alternatives</b>
                <span />
              </div>
              <div>
                <i>03</i>
                <b>The bigger picture</b>
                <span />
              </div>
              <small>ILLUSTRATIVE VIEW</small>
            </div>
            <h3>Get a clearer picture.</h3>
            <p>
              Track brand mentions and inferred positions across engines. See
              your visibility from every angle.
            </p>
          </article>
          <article className="marketing-feature feature-white">
            <span className="feature-icon">
              <Globe2 size={20} />
            </span>
            <div className="marketing-source-visual">
              <span>
                <Link2 size={13} /> FOLLOW THE CITATIONS
              </span>
              <div>
                <Code2 size={15} />
                <b>Community & reference</b>
                <ArrowUpRight size={12} />
              </div>
              <div>
                <Globe2 size={15} />
                <b>Pages AI points to</b>
                <ArrowUpRight size={12} />
              </div>
              <div>
                <MessageSquareText size={15} />
                <b>The voices behind them</b>
                <ArrowUpRight size={12} />
              </div>
              <small>ILLUSTRATIVE VIEW</small>
            </div>
            <h3>Understand the why.</h3>
            <p>
              Follow cited pages, inspect their authority, and discover what’s
              influencing the conversation.
            </p>
          </article>
          <article className="marketing-feature feature-neutral">
            <span className="feature-icon">
              <Sparkles size={20} />
            </span>
            <div className="marketing-action-visual">
              <span>
                <span /> FROM INSIGHT TO ACTION
              </span>
              <div>
                <span>
                  <Check size={12} />
                </span>
                <p>Find your visibility gaps</p>
              </div>
              <div>
                <span>
                  <Check size={12} />
                </span>
                <p>Build a useful writing brief</p>
              </div>
              <div>
                <span>
                  <Plus size={12} />
                </span>
                <p>Make your next move</p>
              </div>
              <small>YOUR NEXT CHAPTER</small>
            </div>
            <h3>Find a way forward.</h3>
            <p>
              Turn the questions you’re missing into a focused content brief,
              and measure what changes.
            </p>
          </article>
        </section>
        <section
          className="marketing-product marketing-wrap"
          id="the-workspace"
        >
          <div className="marketing-product-header">
            <div>
              <span className="marketing-eyebrow">
                02 / A CLEARER PERSPECTIVE
              </span>
              <h2>
                From “are we showing up?”
                <br />
                to “here’s our next move.”
              </h2>
            </div>
            <Link href="/login" className="marketing-button">
              Open your workspace <ArrowUpRight size={15} />
            </Link>
          </div>
          <div className="marketing-browser-frame">
            <div className="marketing-browser-bar">
              <span>
                <i />
                <i />
                <i />
              </span>
              <div>
                <LockKeyhole size={10} /> Your AI visibility workspace
              </div>
              <span>
                <ScanLine size={13} />
              </span>
            </div>
            <Link
              href="/demo"
              className="marketing-screenshot"
              aria-label="Preview sample data"
            >
              <img
                src="/marketing/workspace.png"
                alt="Treg Lens demo showing visibility trends, engine comparisons, share of voice, and content opportunities"
                width={1440}
                height={1421}
                loading="lazy"
              />
              <span className="marketing-preview-cta">
                View the sample preview <ArrowUpRight size={16} />
              </span>
            </Link>
          </div>
          <div className="marketing-product-caption">
            <span>
              <span className="marketing-status-dot" /> YOUR DATA, IN FOCUS
            </span>
            <p>
              Dashboard preview uses illustrative data. Your workspace measures
              real answers.
            </p>
            <span>[ TREG LENS / 001 ]</span>
          </div>
        </section>
        <section className="marketing-workflow marketing-wrap">
          <div className="marketing-workflow-heading">
            <span className="marketing-eyebrow">03 / THE WAY FORWARD</span>
            <h2>
              A little curiosity.
              <br />A lot more clarity.
            </h2>
            <p>
              A practical workflow from the first buyer question to your next
              content brief.
            </p>
            <a href="https://treg.to/aeo" target="_blank" rel="noreferrer">
              Built on the Treg AEO toolkit <ArrowUpRight size={14} />
            </a>
          </div>
          <div className="marketing-steps">
            {steps.map((step) => (
              <article key={step.number}>
                <span className="marketing-step-number">{step.number}</span>
                <div>
                  <span className="marketing-eyebrow">{step.label}</span>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </div>
                <step.icon size={23} />
              </article>
            ))}
          </div>
        </section>
        <section className="marketing-open marketing-wrap" id="open-source">
          <div className="marketing-open-copy">
            <span className="marketing-eyebrow">
              <Code2 size={13} /> OPEN BY DESIGN
            </span>
            <h2>
              Big perspective.
              <br />
              Small bill.
              <br />
              <span>Your code.</span>
            </h2>
            <p>
              Free, MIT-licensed software. Live data through your own Treg key,
              with an estimate before every paid run.
            </p>
            <div className="marketing-open-actions">
              <a
                className="marketing-button light"
                href={GITHUB_FORK_URL}
                target="_blank"
                rel="noreferrer"
              >
                <GitFork size={16} /> Fork on GitHub <ArrowUpRight size={14} />
              </a>
              <a href={DEPLOY_VERCEL_URL} target="_blank" rel="noreferrer">
                Deploy your own <ArrowUpRight size={13} />
              </a>
              <a
                href={`${GITHUB_REPOSITORY}#readme`}
                target="_blank"
                rel="noreferrer"
              >
                Read the docs <ArrowUpRight size={13} />
              </a>
            </div>
          </div>
          <div className="marketing-code-card">
            <div>
              <span>
                <Terminal size={14} /> YOUR NEXT SIDE PROJECT
              </span>
              <span>MIT</span>
            </div>
            <pre>
              <code>
                <span># Make it yours.</span>
                {"\n"}git clone {GITHUB_REPOSITORY}.git{"\n"}cd treg-lens{"\n"}
                npm ci{"\n"}npm run setup{"\n"}npm run doctor{"\n"}npm run dev
              </code>
            </pre>
            <footer>
              <span>
                <span className="marketing-status-dot" /> Ready for your
                perspective.
              </span>
              <Code2 size={15} />
            </footer>
          </div>
          <span className="marketing-open-index">
            THE TOOLS ARE OPEN. THE POSSIBILITIES, TOO.
          </span>
        </section>
        <section className="marketing-faq marketing-wrap">
          <div>
            <span className="marketing-eyebrow">A FEW GOOD QUESTIONS</span>
            <h2>
              Clear answers.
              <br />
              Right from the start.
            </h2>
          </div>
          <div>
            {questions.map((question) => (
              <details key={question.q}>
                <summary>
                  {question.q}
                  <Plus size={17} />
                </summary>
                <p>{question.a}</p>
              </details>
            ))}
          </div>
        </section>
        <section className="marketing-final marketing-wrap">
          <span className="marketing-eyebrow">
            <span className="marketing-status-dot" /> YOUR NEXT CHAPTER STARTS
            HERE
          </span>
          <h2>
            Make the conversation
            <br />a little more <span>you.</span>
          </h2>
          <p>One Treg key. A whole new perspective.</p>
          <div>
            <Link className="marketing-button primary" href="/login">
              <KeyRound size={16} /> Start with your Treg key{" "}
              <ArrowRight size={16} />
            </Link>
            <Link href="/demo">
              Or preview sample data <ArrowUpRight size={13} />
            </Link>
          </div>
          <span className="marketing-final-doodle" aria-hidden="true">
            ✳
          </span>
        </section>
      </main>
      <footer className="marketing-footer marketing-wrap">
        <div>
          <MarketingLogo />
          <span>A clearer perspective on AI search.</span>
        </div>
        <div>
          <a href={GITHUB_REPOSITORY} target="_blank" rel="noreferrer">
            GitHub <ArrowUpRight size={11} />
          </a>
          <a href="https://treg.to/aeo" target="_blank" rel="noreferrer">
            The AEO toolkit <ArrowUpRight size={11} />
          </a>
          <Link href="/login">
            Log in <ArrowUpRight size={11} />
          </Link>
        </div>
        <p>
          Built in the open. Yours to explore.{" "}
          <span>Treg Lens · MIT licensed</span>
        </p>
      </footer>
    </div>
  );
}
