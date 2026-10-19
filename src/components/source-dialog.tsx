"use client";

import { useEffect, useId, useState } from "react";
import {
  ArrowRight,
  ExternalLink,
  FileSearch,
  KeyRound,
  LoaderCircle,
  ShieldCheck,
  X,
} from "lucide-react";
import { DialogFrame } from "./audit-dialog";
import type { SourceQuote, SourceResearch } from "@/lib/source-research";
import "./source-dialog.css";

type Props = {
  open: boolean;
  onClose: () => void;
  source: { url: string; domain: string };
  brand: string;
  token?: string;
  initialResearch?: SourceResearch;
  onComplete?: (research: SourceResearch) => void;
};
const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 6,
  }).format(value);
const metric = (value: number | null, suffix = "") =>
  value === null ? "Not returned" : `${value.toLocaleString()}${suffix}`;

export function SourceDialog(props: Props) {
  return props.open ? (
    <SourceDialogContent
      key={`${props.source.url}:${props.brand}`}
      {...props}
    />
  ) : null;
}

function SourceDialogContent({
  open,
  onClose,
  source,
  brand,
  token = "",
  initialResearch,
  onComplete,
}: Props) {
  const id = useId();
  const [quote, setQuote] = useState<SourceQuote | null>(null);
  const [quoteError, setQuoteError] = useState("");
  const [result, setResult] = useState<SourceResearch | null>(
    initialResearch || null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [apiToken, setApiToken] = useState(token);

  useEffect(() => {
    if (result) return;
    const controller = new AbortController();
    fetch("/api/aeo/source", {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ url: source.url, brand, estimateOnly: true }),
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Source pricing is unavailable.");
        if (!controller.signal.aborted) setQuote(data);
      })
      .catch((failure) => {
        if (!controller.signal.aborted)
          setQuoteError(
            failure instanceof Error
              ? failure.message
              : "Source pricing is unavailable.",
          );
      });
    fetch("/api/aeo/status", { signal: controller.signal })
      .then((response) => response.json())
      .then((data) => {
        if (!controller.signal.aborted) setConfigured(data.configured === true);
      })
      .catch(() => {
        if (!controller.signal.aborted) setConfigured(false);
      });
    return () => controller.abort();
  }, [source.url, brand, result]);

  async function research() {
    if (!quote || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/aeo/source", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: source.url,
          brand,
          ...(apiToken.trim() ? { token: apiToken.trim() } : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error || "Source research could not be completed.",
        );
      setResult(data);
      onComplete?.(data);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Source research could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogFrame
      open={open}
      onClose={busy ? () => {} : onClose}
      titleId={`${id}-title`}
      descriptionId={`${id}-description`}
      className="lens-source-dialog"
    >
      <div className="lens-dialog-heading">
        <div className="lens-dialog-eyebrow">
          <span className="lens-eyebrow-dot" /> SOURCE INTELLIGENCE
        </div>
        <button
          className="lens-dialog-close"
          type="button"
          aria-label="Close source research"
          onClick={onClose}
          disabled={busy}
        >
          <X size={19} />
        </button>
        <div className="lens-dialog-title-row">
          <span className="lens-dialog-icon">
            <FileSearch size={22} strokeWidth={1.6} />
          </span>
          <h2 id={`${id}-title`}>Understand the source.</h2>
        </div>
        <p id={`${id}-description`}>
          Read the page AI cited. Measure its authority and find the evidence
          for your next move.
        </p>
      </div>
      <div className="lens-dialog-body">
        <a
          className="lens-source-address"
          href={source.url}
          target="_blank"
          rel="noreferrer"
        >
          <span>
            <strong>{source.domain}</strong>
            <small>{source.url}</small>
          </span>
          <ExternalLink size={15} />
        </a>
        {result ? (
          <>
            <div className="lens-source-evidence-label">
              AUTHORITY ·{" "}
              {result.provenance.metricsProvider || "PROVIDER NOT RETURNED"}
            </div>
            <div className="lens-source-metrics">
              <div>
                <span>Domain Authority</span>
                <strong
                  className={
                    result.metrics.domainAuthority === null ? "unknown" : ""
                  }
                >
                  {metric(result.metrics.domainAuthority)}
                  <small>
                    {result.metrics.domainAuthority !== null ? "/ 100" : ""}
                  </small>
                </strong>
              </div>
              <div>
                <span>Page Authority</span>
                <strong
                  className={
                    result.metrics.pageAuthority === null ? "unknown" : ""
                  }
                >
                  {metric(result.metrics.pageAuthority)}
                  <small>
                    {result.metrics.pageAuthority !== null ? "/ 100" : ""}
                  </small>
                </strong>
              </div>
              <div>
                <span>Spam Score</span>
                <strong
                  className={result.metrics.spamScore === null ? "unknown" : ""}
                >
                  {metric(result.metrics.spamScore, "%")}
                </strong>
              </div>
              <div>
                <span>Referring domains to page</span>
                <strong
                  className={
                    result.metrics.referringDomains === null ? "unknown" : ""
                  }
                >
                  {metric(result.metrics.referringDomains)}
                </strong>
              </div>
            </div>
            <p className="lens-source-footnote">
              Moz scores describe link authority, not AI recommendation
              likelihood. Last crawl:{" "}
              {result.metrics.lastCrawled || "not returned"}.
            </p>
            <div className="lens-source-evidence-label">
              PAGE EVIDENCE ·{" "}
              {result.provenance.contentProvider || "PROVIDER NOT RETURNED"}
            </div>
            <article className="lens-source-page">
              <h3>{result.title || "Page title not returned"}</h3>
              <div className="lens-source-byline">
                <span>Author: {result.author || "not returned"}</span>
                <span>Published: {result.publishedAt || "not returned"}</span>
              </div>
              <div
                className={`lens-source-mention ${result.brandMentioned === true ? "is-present" : ""}`}
              >
                <ShieldCheck size={15} />
                <span>
                  {result.brandMentioned === null
                    ? "Brand presence could not be checked."
                    : result.brandMentioned
                      ? `${brand} appears ${result.brandOccurrences} ${result.brandOccurrences === 1 ? "time" : "times"} in the returned text.`
                      : `${brand} was not found in the returned text.`}
                </span>
              </div>
              {result.brandExcerpts.length > 0 && (
                <div className="lens-source-snippets">
                  {result.brandExcerpts.map((snippet, index) => (
                    <blockquote key={index}>…{snippet}…</blockquote>
                  ))}
                </div>
              )}
              <details
                className="lens-source-excerpt"
                open={!result.brandExcerpts.length}
              >
                <summary>Read extracted excerpt</summary>
                <p>
                  {result.excerpt || "Readable page content was not returned."}
                </p>
              </details>
              <p className="lens-source-footnote">
                {result.contentCharacters.toLocaleString()} characters returned.{" "}
                {result.provenance.contentFreshness
                  ? `Provider source: ${result.provenance.contentFreshness}. `
                  : ""}
                Extraction can be incomplete; absence in this text does not
                prove absence from the full website.
              </p>
            </article>
            <div className="lens-source-evidence-label">
              CONTACT ROUTES FOUND ON THIS PAGE
            </div>
            {result.contactRoutes.length ? (
              <div className="lens-source-contacts">
                {result.contactRoutes.map((route) => (
                  <a
                    href={route.url}
                    key={route.url}
                    target={route.kind === "email" ? undefined : "_blank"}
                    rel="noreferrer"
                  >
                    <span>
                      <strong>{route.label}</strong>
                      <small>{route.url}</small>
                    </span>
                    <ExternalLink size={13} />
                  </a>
                ))}
              </div>
            ) : (
              <p className="lens-source-empty">
                No author profile, contact page, or email address was returned
                in this extraction.
              </p>
            )}
            {result.errors.map((failure) => (
              <div
                className="lens-dialog-notice lens-dialog-notice-warning"
                key={failure.step}
              >
                {failure.step === "metrics"
                  ? "Authority lookup"
                  : "Page extraction"}
                : {failure.error}
              </div>
            ))}
          </>
        ) : (
          <>
            <div className="lens-source-plan">
              <div>
                <span>01</span>
                <p>
                  <strong>Measure the page</strong>
                  <small>
                    Real Moz Domain Authority, Page Authority, and linking
                    domains.
                  </small>
                </p>
              </div>
              <div>
                <span>02</span>
                <p>
                  <strong>Read what AI is reading</strong>
                  <small>
                    Extract the page with Exa. Check {brand} mentions,
                    authorship, and contact routes actually present.
                  </small>
                </p>
              </div>
            </div>
            <p className="lens-source-footnote">
              Your citation data stays in this browser. Source research makes
              two explicit Treg calls after you start it.
            </p>
            <details
              className="lens-token-details"
              open={configured === false && !token}
            >
              <summary>
                <span>
                  <KeyRound size={12} />
                  {configured
                    ? "Server token connected · use a different token"
                    : "Connect your Treg token"}
                </span>
              </summary>
              <div className="lens-token-details-body">
                <label className="lens-dialog-field">
                  Treg token
                  <input
                    type="password"
                    value={apiToken}
                    onChange={(event) => setApiToken(event.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="Paste your team token"
                    disabled={busy}
                  />
                </label>
                <p className="lens-field-help">
                  Used only for this request. Never saved in browser storage.
                </p>
              </div>
            </details>
            {quoteError && (
              <div
                className="lens-dialog-notice lens-dialog-notice-error"
                role="alert"
              >
                {quoteError}
              </div>
            )}
            {error && (
              <div
                className="lens-dialog-notice lens-dialog-notice-error"
                role="alert"
              >
                {error}
              </div>
            )}
            {busy && (
              <div className="lens-audit-progress" role="status">
                <div className="lens-progress-heading">
                  <LoaderCircle size={16} className="lens-spin" />
                  <strong>Reading the evidence…</strong>
                </div>
                <p>
                  Keep this window open while the authority lookup and
                  extraction finish.
                </p>
                <div className="lens-indeterminate-track">
                  <span />
                </div>
              </div>
            )}
          </>
        )}
      </div>
      <div className="lens-dialog-footer">
        {result ? (
          <>
            <div className="lens-audit-estimate">
              <span className="lens-estimate-label">RECORDED TREG CHARGE</span>
              <span className="lens-estimate-value">
                {result.totalCostUsd === null
                  ? "Not fully returned"
                  : money(result.totalCostUsd)}
              </span>
              {!result.costKnown && (
                <span className="lens-source-footnote">
                  Known charges: {money(result.knownCostUsd)}. Check Treg
                  activity for the complete cost.
                </span>
              )}
            </div>
            <button
              className="lens-source-refresh"
              onClick={() => {
                setResult(null);
                setQuote(null);
                setQuoteError("");
                setError("");
              }}
              title="Get a fresh estimate before another research run"
            >
              Refresh research
            </button>
            <button className="lens-dialog-primary" onClick={onClose}>
              Done <ArrowRight size={14} />
            </button>
            <p className="lens-cost-note">
              Evidence collected {new Date(result.completedAt).toLocaleString()}
              . Refresh research opens a new estimate before any paid lookup.
            </p>
          </>
        ) : (
          <>
            <div className="lens-audit-estimate">
              <span className="lens-estimate-label">
                ESTIMATED TREG COST · 2 CALLS
              </span>
              <span className="lens-estimate-value">
                {quote ? (
                  money(quote.totalCostUsd)
                ) : quoteError ? (
                  "Unavailable"
                ) : (
                  <span className="lens-estimate-loading">
                    Getting live prices…
                  </span>
                )}
              </span>
            </div>
            <button
              className="lens-dialog-primary"
              disabled={!quote || busy || !(configured || apiToken.trim())}
              onClick={research}
            >
              {busy ? (
                <LoaderCircle size={14} className="lens-spin" />
              ) : (
                <FileSearch size={14} />
              )}
              {busy ? "Researching…" : "Research source"}
            </button>
            {quote && (
              <>
                <div className="lens-source-price-breakdown">
                  {quote.steps.map((step) => (
                    <span key={step.step}>
                      {step.provider === "moz"
                        ? "Moz authority"
                        : "Exa extraction"}
                      <strong>{money(step.estimatedCostUsd)}</strong>
                    </span>
                  ))}
                </div>
                <p className="lens-cost-note">{quote.note}</p>
              </>
            )}
          </>
        )}
      </div>
    </DialogFrame>
  );
}
