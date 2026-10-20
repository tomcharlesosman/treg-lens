/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  GitFork,
  KeyRound,
  LockKeyhole,
  Plus,
} from "lucide-react";
import KeySignInForm from "./key-sign-in-form";
import LensAnswer from "./lens-answer";
import MarketingLogo from "./marketing-logo";
import WorkspaceLoupe from "./workspace-loupe";
import { DEPLOY_VERCEL_URL, GITHUB_FORK_URL, GITHUB_REPOSITORY } from "@/lib/site";
import "./marketing.css";
import "./landing.css";

const engines = [
  { id: "chatgpt", name: "ChatGPT" },
  { id: "perplexity", name: "Perplexity" },
  { id: "gemini", name: "Gemini" },
  { id: "google", name: "Google AI Mode" },
];

function EngineIcon({ id, size = 18 }: { id: string; size?: number }) {
  return <img src={`/engines/${id}.svg`} alt="" width={size} height={size} />;
}

function Pixel() {
  return (
    <span className="ll-pixel" aria-hidden="true">
      <i />
      <i />
    </span>
  );
}

const questions = [
  {
    q: "How do I get started?",
    a: "Paste a team-scoped Treg API key, then enter your website. Lens shows the cost before researching your brand and suggesting competitors and buyer questions. Review and edit the suggestions, or set up manually for free. Returning users go straight to their saved workspace.",
  },
  {
    q: "Is Treg Lens free?",
    a: "The software is free and MIT licensed. Live research uses your Treg credits and may also incur your own hosting costs. Lens shows a current estimate before brand research, audits, prompt discovery, or source lookups. Manual brand setup is free.",
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
    <div className="lens-landing">
      <header className="marketing-nav ll-nav">
        <MarketingLogo />
        <nav aria-label="Marketing navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#the-workspace">The workspace</a>
          <a href="#open-source">Open source</a>
        </nav>
        <div className="ll-nav-actions">
          <Link href="/login" className="ll-nav-login">
            Log in
          </Link>
          <a
            className="ll-pill"
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
        <section className="ll-hero" id="connect">
          <div className="ll-hero-backdrop" aria-hidden="true" />
          <div className="ll-wrap ll-hero-copy">
            <a
              className="ll-badge"
              href={GITHUB_REPOSITORY}
              target="_blank"
              rel="noreferrer"
            >
              <span>treg / lens</span>
              <i aria-hidden="true" />
              open-source AI visibility <ArrowUpRight size={12} />
            </a>
            <h1>
              Your brand belongs <br className="ll-break" />
              in the <span className="ll-mark">answer</span>.
            </h1>
            <p className="ll-lede">
              See what AI tells your buyers, which sources shape the answer, and
              what to publish next. Open source, on your own treg key.
            </p>
            <section
              className="ll-engines"
              aria-label="Supported answer engines"
            >
              <span className="ll-engines-label">Asks</span>
              <ul>
                {engines.map((engine) => (
                  <li key={engine.id}>
                    <EngineIcon id={engine.id} />
                    <span>{engine.name}</span>
                  </li>
                ))}
              </ul>
            </section>
            <div className="ll-keybox">
              <KeySignInForm compact />
              <div className="ll-keybox-foot">
                <Link href="/demo">
                  Preview sample data <ArrowUpRight size={13} />
                </Link>
                <span>No key needed · illustrative data</span>
              </div>
            </div>
          </div>

          <div className="ll-wrap ll-stage">
            <div className="ll-stage-label">
              <span>
                <Pixel /> Illustrative answers · fictional brands
              </span>
              <span className="ll-stage-hint">Move your cursor over an answer</span>
            </div>
            <LensAnswer />
          </div>
        </section>

        <section className="ll-section ll-wrap" id="how-it-works">
          <div className="ll-head">
            <div>
              <span className="ll-kicker">How it works</span>
              <h2>From a buyer’s question to your next brief.</h2>
            </div>
            <ul className="ll-ticks">
              <li>discover the questions</li>
              <li>measure the answers</li>
              <li>follow the sources</li>
              <li>act on the gaps</li>
            </ul>
          </div>

          <div className="ll-steps">
            <article className="ll-step">
              <div className="ll-step-ui ll-ui-discover" aria-hidden="true">
                <span className="ll-ui-label">› seed: crm for small teams</span>
                <ul>
                  <li className="is-on">
                    <i /> best crm for small teams <b>2.4k</b>
                  </li>
                  <li className="is-on">
                    <i /> crm with email tracking <b>880</b>
                  </li>
                  <li>
                    <i /> is a crm worth it? <b>PAA</b>
                  </li>
                  <li className="is-on">
                    <i /> northwind alternatives <b>390</b>
                  </li>
                </ul>
              </div>
              <span className="ll-step-index">01 · Discover</span>
              <h3>Find the questions buyers ask.</h3>
              <p>
                Seed two or three phrases. Lens pulls Google keyword ideas and
                real People Also Ask questions; track up to eight.
              </p>
            </article>

            <article className="ll-step">
              <div className="ll-step-ui ll-ui-measure" aria-hidden="true">
                <span className="ll-ui-label">› asked 4 engines</span>
                <ul>
                  <li>
                    <EngineIcon id="chatgpt" size={14} /> ChatGPT <b>#2</b>
                  </li>
                  <li>
                    <EngineIcon id="perplexity" size={14} /> Perplexity{" "}
                    <b>#1</b>
                  </li>
                  <li className="is-gap">
                    <EngineIcon id="gemini" size={14} /> Gemini <b>gap</b>
                  </li>
                  <li>
                    <EngineIcon id="google" size={14} /> AI Mode <b>#3</b>
                  </li>
                </ul>
              </div>
              <span className="ll-step-index">02 · Measure</span>
              <h3>See who gets recommended.</h3>
              <p>
                Ask ChatGPT, Perplexity, Gemini and Google AI Mode. Track
                mentions, inferred positions and share of voice against your
                competitors.
              </p>
            </article>

            <article className="ll-step">
              <div className="ll-step-ui ll-ui-sources" aria-hidden="true">
                <span className="ll-ui-label">› cited pages, by authority</span>
                <ul>
                  <li>
                    g2.com <span style={{ ["--w" as string]: "92%" }} />
                  </li>
                  <li>
                    reddit.com <span style={{ ["--w" as string]: "84%" }} />
                  </li>
                  <li>
                    capterra.com <span style={{ ["--w" as string]: "71%" }} />
                  </li>
                  <li className="is-you">
                    yourbrand.com <span style={{ ["--w" as string]: "38%" }} />
                  </li>
                </ul>
              </div>
              <span className="ll-step-index">03 · Understand</span>
              <h3>Follow the trail of sources.</h3>
              <p>
                Open the pages AI cites, check their authority, and read the
                excerpts, authors and contact routes behind each answer.
              </p>
            </article>

            <article className="ll-step">
              <div className="ll-step-ui ll-ui-act" aria-hidden="true">
                <span className="ll-ui-label">› brief: email tracking</span>
                <ul>
                  <li className="is-done">Answer it up front</li>
                  <li className="is-done">Link your pricing page</li>
                  <li>Pitch capterra.com’s list</li>
                </ul>
              </div>
              <span className="ll-step-index">04 · Act</span>
              <h3>Make your next move.</h3>
              <p>
                Turn visibility gaps into editable writing-brief templates, log
                what you shipped, and measure again against your baseline.
              </p>
            </article>
          </div>

          <div className="ll-monitor">
            <div className="ll-monitor-copy">
              <span className="ll-step-index">05 · Monitor</span>
              <p>
                <strong>Re-check on a schedule.</strong> Daily or weekly audits
                at a UTC hour you choose, inside per-audit and monthly spending
                limits. Opt in; nothing runs on its own.
              </p>
            </div>
            <div className="ll-monitor-chart" aria-hidden="true">
              {[22, 28, 26, 34, 41, 39, 47, 52, 50, 58, 63, 61, 68, 74].map(
                (value, index) => (
                  <i key={index} style={{ ["--h" as string]: `${value}%` }} />
                ),
              )}
            </div>
          </div>
          <p className="ll-footnote">Card previews use illustrative data.</p>
        </section>

        <section className="ll-section ll-wrap" id="the-workspace">
          <div className="ll-head">
            <div>
              <span className="ll-kicker">The workspace</span>
              <h2>Every answer, every source, one workspace.</h2>
            </div>
            <div className="ll-head-actions">
              <p>
                Visibility score, share of voice, citations and opportunities.
                Partial results and errors stay inspectable.
              </p>
              <Link href="/login" className="ll-pill">
                Open your workspace <ArrowUpRight size={14} />
              </Link>
            </div>
          </div>
          <div className="ll-window">
            <div className="ll-window-bar">
              <span aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span>
                <LockKeyhole size={11} /> lens / overview
              </span>
              <span className="ll-window-tag">sample data</span>
            </div>
            <WorkspaceLoupe />
          </div>
          <p className="ll-footnote">
            Preview uses illustrative data; your workspace measures real
            answers.<span className="ll-hover-only"> Hover to magnify.</span>
          </p>
        </section>

        <section className="ll-section ll-wrap ll-split">
          <div>
            <span className="ll-kicker">Pricing</span>
            <h2>
              No subscription. <br className="ll-break" />A price before every
              run.
            </h2>
            <p>
              Lens is free software. Live research spends your own treg credits,
              priced from the live treg catalog before you confirm. Verifying a
              key costs nothing, even at a zero balance.
            </p>
            <ul className="ll-ticks">
              <li>no seats, no lock-in</li>
              <li>estimate before every paid call</li>
              <li>unknown charges never shown as $0</li>
            </ul>
          </div>
          <div className="ll-estimate" aria-label="How an audit estimate works">
            <div className="ll-window-bar">
              <span aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span>audit estimate · before you run</span>
            </div>
            <dl>
              <div>
                <dt>Prompts</dt>
                <dd>up to 8</dd>
              </div>
              <div>
                <dt>Engines</dt>
                <dd>4</dd>
              </div>
              <div>
                <dt>Calls</dt>
                <dd>prompts × engines</dd>
              </div>
              <div>
                <dt>Priced</dt>
                <dd>live, per call</dd>
              </div>
              <div>
                <dt>Safety limit</dt>
                <dd className="ll-pixel-num">$1.00</dd>
              </div>
            </dl>
            <p>
              <Check size={13} /> Nothing runs until you confirm.
            </p>
          </div>
        </section>

        <section
          className="ll-section ll-wrap ll-split is-flipped"
          id="open-source"
        >
          <div>
            <span className="ll-kicker">Open source · MIT</span>
            <h2>Fork it. Run it. Make it yours.</h2>
            <p>
              Read every line, run it locally on SQLite, or deploy to Vercel
              with Neon Postgres. Your key lives in an encrypted session and
              never appears in exports.
            </p>
            <div className="ll-actions">
              <a
                className="ll-pill"
                href={GITHUB_FORK_URL}
                target="_blank"
                rel="noreferrer"
              >
                <GitFork size={15} /> Fork on GitHub
              </a>
              <a
                className="ll-ghost"
                href={DEPLOY_VERCEL_URL}
                target="_blank"
                rel="noreferrer"
              >
                Deploy your own <ArrowUpRight size={13} />
              </a>
              <a
                className="ll-ghost"
                href={`${GITHUB_REPOSITORY}#readme`}
                target="_blank"
                rel="noreferrer"
              >
                Read the docs <ArrowUpRight size={13} />
              </a>
            </div>
          </div>
          <div className="ll-terminal">
            <div className="ll-window-bar">
              <span aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span>~/treg-lens</span>
              <span className="ll-window-tag">MIT</span>
            </div>
            <pre>
              <code>
                <span className="ll-dim"># make it yours</span>
                {"\n"}
                <b>$</b> git clone {GITHUB_REPOSITORY}.git{"\n"}
                <b>$</b> cd treg-lens{"\n"}
                <b>$</b> npm ci{"\n"}
                <b>$</b> npm run setup{"\n"}
                <b>$</b> npm run doctor{"\n"}
                <b>$</b> npm run dev{"\n"}
                <span className="ll-ok">✓ Ready on localhost:3000</span>
              </code>
            </pre>
          </div>
        </section>

        <section className="ll-section ll-wrap ll-faq">
          <div>
            <span className="ll-kicker">FAQ</span>
            <h2>Good questions.</h2>
            <p className="ll-faq-more">
              Something else?{" "}
              <a
                href={`${GITHUB_REPOSITORY}/issues`}
                target="_blank"
                rel="noreferrer"
              >
                Ask in the repo <ArrowUpRight size={13} />
              </a>
            </p>
          </div>
          <div>
            {questions.map((question) => (
              <details key={question.q}>
                <summary>
                  {question.q}
                  <Plus size={16} aria-hidden="true" />
                </summary>
                <p>{question.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="ll-final">
          <div className="ll-wrap">
            <span className="ll-kicker">
              <Pixel /> Your next move
            </span>
            <h2>
              Bring your brand <br className="ll-break" />
              into focus.
            </h2>
            <p>One treg key. Four answer engines. Every source on the record.</p>
            <div className="ll-actions">
              <Link className="ll-pill is-light" href="/login">
                <KeyRound size={15} /> Start with your treg key{" "}
                <ArrowRight size={15} />
              </Link>
              <Link className="ll-ghost is-dark" href="/demo">
                Preview sample data <ArrowUpRight size={13} />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="ll-footer">
        <div className="ll-wrap ll-footer-grid">
          <div className="ll-footer-brand">
            <MarketingLogo light />
            <p>An open-source lens on AI search, powered by treg.</p>
          </div>
          <nav aria-label="Footer">
            <div>
              <span>Product</span>
              <a href="#how-it-works">How it works</a>
              <Link href="/demo">Sample workspace</Link>
              <Link href="/login">Log in</Link>
            </div>
            <div>
              <span>Open source</span>
              <a href={GITHUB_REPOSITORY} target="_blank" rel="noreferrer">
                GitHub
              </a>
              <a
                href={`${GITHUB_REPOSITORY}/blob/main/docs/GETTING-STARTED.md`}
                target="_blank"
                rel="noreferrer"
              >
                Getting started
              </a>
              <a
                href={`${GITHUB_REPOSITORY}/blob/main/LICENSE`}
                target="_blank"
                rel="noreferrer"
              >
                MIT license
              </a>
            </div>
            <div>
              <span>treg</span>
              <a href="https://treg.to/aeo" target="_blank" rel="noreferrer">
                The AEO toolkit
              </a>
              <a href="https://treg.to/app" target="_blank" rel="noreferrer">
                Get a treg key
              </a>
              <a href="https://treg.to" target="_blank" rel="noreferrer">
                treg.to
              </a>
            </div>
          </nav>
        </div>
        <div className="ll-wrap ll-footer-base">
          <span>Built in the open. Product names belong to their owners.</span>
          <span>Treg Lens · MIT licensed</span>
        </div>
        <div className="ll-wordmark" aria-hidden="true">
          lens
        </div>
      </footer>
    </div>
  );
}
