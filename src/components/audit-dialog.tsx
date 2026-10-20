"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  ExternalLink,
  Globe2,
  KeyRound,
  LoaderCircle,
  Plus,
  Radar,
  Sparkles,
  X,
} from "lucide-react";
import type { AnswerResult } from "@/lib/aeo";
import { normalizeDomain, type Project } from "@/lib/workspace-data";
import type { AuditPersistence } from "./use-server-workspace";
import "./dialog.css";

export type ProjectSettings = Project;
export type AuditRun = {
  id: string;
  brand: string;
  domain: string;
  prompts: string[];
  competitors: string[];
  engines: Engine[];
  results: AnswerResult[];
  errors: Array<{ prompt: string; engine: string; error: string }>;
  totalCostUsd: number;
  totalCostKnown?: boolean;
  completedAt: string;
};
type Engine = "chatgpt" | "perplexity" | "gemini" | "google";
type Estimate = {
  currency: "USD";
  totalCostUsd: number;
  callCount: number;
  byEngine: Array<{
    engine: Engine;
    endpointId: string;
    calls: number;
    costPerCallUsd: number;
    subtotalUsd: number;
  }>;
  note: string;
};
type AuditDialogProps = {
  open: boolean;
  onClose: () => void;
  onComplete: (run: AuditRun, persistence?: AuditPersistence) => void;
  project: ProjectSettings;
  initialPrompts?: string[];
  token?: string;
};
const engineOptions: {
  id: Engine;
  label: string;
  symbol: string;
  className: string;
  description: string;
}[] = [
  {
    id: "chatgpt",
    label: "ChatGPT",
    symbol: "✳",
    className: "chatgpt",
    description: "Web interface",
  },
  {
    id: "perplexity",
    label: "Perplexity",
    symbol: "⌘",
    className: "perplexity",
    description: "Sonar API",
  },
  {
    id: "gemini",
    label: "Gemini",
    symbol: "✦",
    className: "gemini",
    description: "Web interface",
  },
  {
    id: "google",
    label: "Google",
    symbol: "G",
    className: "google",
    description: "AI Mode web search",
  },
];

const defaultPrompts = (brand: string) => [
  "What are the best API toolkits for AI agents that need live web data?",
  "Which platforms combine web search, scraping, and data enrichment in one API?",
  "What is the best toolkit for measuring brand visibility in AI search?",
  `How does ${brand || "Treg"} compare with other AI agent data platforms?`,
];
const money = (amount: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(amount);
const splitItems = (value: string) =>
  value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
const subscribeToClient = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

/** Shared modal primitive: labelled, focus-contained, Escape-dismissable, and focus-restoring. */
export function DialogFrame({
  open,
  onClose,
  titleId,
  descriptionId,
  className = "",
  children,
}: {
  open: boolean;
  onClose: () => void;
  titleId: string;
  descriptionId?: string;
  className?: string;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const mounted = useSyncExternalStore(
    subscribeToClient,
    clientSnapshot,
    serverSnapshot,
  );

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!open || !mounted) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () =>
      Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex="0"]',
        ) ?? [],
      ).filter((element) => element.getClientRects().length > 0);
    const frame = window.requestAnimationFrame(() => {
      if (panelRef.current?.contains(document.activeElement)) return;
      const initial = panelRef.current?.querySelector<HTMLElement>(
        "[data-initial-focus]",
      );
      (initial ?? focusable()[0] ?? panelRef.current)?.focus();
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key !== "Tab") return;
      const elements = focusable();
      if (!elements.length) {
        event.preventDefault();
        panelRef.current?.focus();
        return;
      }
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !panelRef.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !panelRef.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open, mounted]);

  if (!mounted || !open) return null;
  return createPortal(
    <div
      className="lens-dialog-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className={`lens-dialog ${className}`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function AuditDialog({
  open,
  onClose,
  onComplete,
  project,
  initialPrompts,
  token = "",
}: AuditDialogProps) {
  const id = useId();
  const [brand, setBrand] = useState(project.brand);
  const [domain, setDomain] = useState(project.domain);
  const [competitors, setCompetitors] = useState(
    project.competitors.join(", "),
  );
  const [promptsText, setPromptsText] = useState(
    (initialPrompts?.length
      ? initialPrompts
      : defaultPrompts(project.brand)
    ).join("\n"),
  );
  const [engines, setEngines] = useState<Engine[]>(["chatgpt", "perplexity"]);
  const [apiToken, setApiToken] = useState(token);
  const [serverConfigured, setServerConfigured] = useState<boolean | null>(
    null,
  );
  const [estimateState, setEstimateState] = useState<{
    request: string;
    quote: Estimate | null;
    error: string;
  } | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState("");
  const [completedRun, setCompletedRun] = useState<AuditRun | null>(null);
  const wasOpen = useRef(false);
  const runningRef = useRef(false);
  const prompts = useMemo(
    () =>
      promptsText
        .split("\n")
        .map((prompt) => prompt.trim())
        .filter(Boolean),
    [promptsText],
  );
  const competitorsList = useMemo(() => splitItems(competitors), [competitors]);
  const validPrompts =
    prompts.length > 0 &&
    prompts.length <= 8 &&
    prompts.every((prompt) => prompt.length <= 500);
  const validForm = Boolean(
    brand.trim() &&
    domain.trim() &&
    validPrompts &&
    engines.length &&
    competitorsList.length <= 8,
  );
  const estimateRequest = useMemo(
    () =>
      JSON.stringify({
        brand: brand.trim(),
        domain: domain.trim(),
        competitors: competitorsList,
        prompts,
        engines,
        market: { country: "US", language: "en" },
      }),
    [brand, domain, competitorsList, prompts, engines],
  );
  const estimate =
    estimateState?.request === estimateRequest ? estimateState.quote : null;
  const estimateError =
    estimateState?.request === estimateRequest ? estimateState.error : "";
  const estimateLoading =
    open &&
    validForm &&
    !running &&
    !completedRun &&
    estimateState?.request !== estimateRequest;

  useEffect(() => {
    if (open && !wasOpen.current && !runningRef.current) {
      setBrand(project.brand);
      setDomain(project.domain);
      setCompetitors(project.competitors.join(", "));
      setPromptsText(
        (initialPrompts?.length
          ? initialPrompts
          : defaultPrompts(project.brand)
        ).join("\n"),
      );
      setApiToken(token);
      setCompletedRun(null);
      setRunError("");
    }
    wasOpen.current = open;
  }, [open, project, initialPrompts, token]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    fetch("/api/aeo/status", { signal: controller.signal })
      .then((response) => response.json())
      .then((data) => {
        setServerConfigured(data.configured === true);
      })
      .catch(() => {
        if (!controller.signal.aborted) setServerConfigured(false);
      });
    return () => controller.abort();
  }, [open]);

  useEffect(() => {
    if (!open || running || completedRun || !validForm) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/aeo/estimate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: estimateRequest,
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Could not calculate pricing.");
        if (!controller.signal.aborted)
          setEstimateState({
            request: estimateRequest,
            quote: data,
            error: "",
          });
      } catch (error) {
        if (!controller.signal.aborted)
          setEstimateState({
            request: estimateRequest,
            quote: null,
            error:
              error instanceof Error
                ? error.message
                : "Could not calculate pricing.",
          });
      }
    }, 450);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, running, completedRun, validForm, estimateRequest]);

  async function runAudit() {
    if (!validForm || !estimate || running) return;
    setRunError("");
    setRunning(true);
    runningRef.current = true;
    try {
      const response = await fetch("/api/aeo/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand: brand.trim(),
          domain: domain.trim(),
          competitors: competitorsList,
          prompts,
          engines,
          market: { country: "US", language: "en" },
          maxCostUsd: estimate.totalCostUsd,
          ...(apiToken.trim() ? { token: apiToken.trim() } : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "The audit could not be completed.");
      const run: AuditRun = {
        id: typeof data.auditId === "string" ? data.auditId : crypto.randomUUID(),
        brand: brand.trim(),
        domain: domain.trim(),
        prompts,
        competitors: competitorsList,
        engines,
        results: data.results,
        errors: data.errors,
        totalCostUsd: data.totalCostUsd,
        totalCostKnown: data.totalCostKnown,
        completedAt: data.completedAt,
      };
      setCompletedRun(run);
      onComplete(run, { saved: data.saved === true, storageError: data.storageError });
    } catch (error) {
      setRunError(
        error instanceof Error
          ? error.message
          : "The audit could not be completed. Please try again.",
      );
    } finally {
      setRunning(false);
      runningRef.current = false;
    }
  }

  const mentionCount =
    completedRun?.results.filter((result) => result.brandMentioned).length ?? 0;
  return (
    <DialogFrame
      open={open}
      onClose={onClose}
      titleId={`${id}-title`}
      descriptionId={`${id}-description`}
      className="lens-audit-dialog"
    >
      <div className="lens-dialog-heading">
        <div className="lens-dialog-eyebrow">
          <span className="lens-eyebrow-dot" /> LIVE INTELLIGENCE
        </div>
        <button
          className="lens-dialog-close"
          type="button"
          aria-label="Close audit"
          onClick={onClose}
        >
          <X size={19} />
        </button>
        <div className="lens-dialog-title-row">
          <div className="lens-dialog-icon">
            <Radar size={23} strokeWidth={1.6} />
          </div>
          <h2 id={`${id}-title`}>See where you stand.</h2>
        </div>
        <p id={`${id}-description`}>
          Ask the questions your customers ask. Find out if AI recommends you.
        </p>
      </div>

      {completedRun ? (
        <div className="lens-audit-complete" aria-live="polite">
          <span className="lens-complete-icon">
            <CheckCircle2 size={30} strokeWidth={1.5} />
          </span>
          <span className="lens-dialog-eyebrow">AUDIT COMPLETE</span>
          <h3>Your next move starts here.</h3>
          <p>
            {completedRun.results.length} answers collected across{" "}
            {new Set(completedRun.results.map((result) => result.engine)).size}{" "}
            engines. {brand} appeared in {mentionCount}{" "}
            {mentionCount === 1 ? "answer" : "answers"}.
          </p>
          <div className="lens-complete-stats">
            <div>
              <strong>{completedRun.results.length}</strong>
              <span>Answers collected</span>
            </div>
            <div>
              <strong>{mentionCount}</strong>
              <span>Brand mentions</span>
            </div>
            <div>
              <strong>
                {completedRun.totalCostKnown === false
                  ? "Not fully reported"
                  : money(completedRun.totalCostUsd)}
              </strong>
              <span>API cost</span>
            </div>
          </div>
          {completedRun.errors.length > 0 && (
            <div className="lens-dialog-notice lens-dialog-notice-warning">
              {completedRun.errors.length}{" "}
              {completedRun.errors.length === 1
                ? "request did"
                : "requests did"}{" "}
              not complete. {completedRun.errors[0].error}
            </div>
          )}
          <button
            className="lens-dialog-primary"
            type="button"
            onClick={onClose}
          >
            Explore your results <ArrowRight size={16} />
          </button>
        </div>
      ) : (
        <>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void runAudit();
            }}
          >
            <div className="lens-dialog-body">
              <div className="lens-audit-scope" aria-label="Audit scope"><strong>United States / English</strong><span>{prompts.length} {prompts.length === 1 ? "question" : "questions"} × {engines.length} {engines.length === 1 ? "engine" : "engines"} = {prompts.length * engines.length} requested answers</span><p>Choose a small first check, then expand when it answers a useful question. This action does not enable monitoring.</p>{project.audience && brand.trim().toLowerCase() === project.brand.trim().toLowerCase() && normalizeDomain(domain) === normalizeDomain(project.domain) && <p><b>Saved buyer context:</b> {project.audience}</p>}</div>
              <fieldset className="lens-dialog-fieldset" disabled={running}>
                <div className="lens-field-section-label">
                  <span>01</span> THE BRAND
                </div>
                <div className="lens-dialog-grid">
                  <label className="lens-dialog-field" htmlFor={`${id}-brand`}>
                    Brand name
                    <input
                      id={`${id}-brand`}
                      data-initial-focus
                      value={brand}
                      onChange={(event) => setBrand(event.target.value)}
                      placeholder="Treg"
                      maxLength={100}
                      required
                    />
                  </label>
                  <label className="lens-dialog-field" htmlFor={`${id}-domain`}>
                    Website
                    <div className="lens-input-icon">
                      <Globe2 size={15} />
                      <input
                        id={`${id}-domain`}
                        value={domain}
                        onChange={(event) => setDomain(event.target.value)}
                        placeholder="treg.to"
                        maxLength={200}
                        required
                      />
                    </div>
                  </label>
                </div>
                <label
                  className="lens-dialog-field"
                  htmlFor={`${id}-competitors`}
                >
                  Competitors{" "}
                  <span className="lens-field-optional">optional</span>
                  <input
                    id={`${id}-competitors`}
                    value={competitors}
                    onChange={(event) => setCompetitors(event.target.value)}
                    placeholder="Exa, Firecrawl, Tavily"
                    aria-describedby={`${id}-competitor-help`}
                  />
                  <span
                    id={`${id}-competitor-help`}
                    className="lens-field-help"
                  >
                    Separate up to 8 brands with commas.
                  </span>
                </label>

                <div className="lens-field-section-label">
                  <span>02</span> THE CONVERSATION
                </div>
                <label className="lens-dialog-field" htmlFor={`${id}-prompts`}>
                  <span className="lens-field-label-row">
                    Prompts to track
                    <span
                      className={`lens-field-counter ${!validPrompts ? "lens-counter-invalid" : ""}`}
                    >
                      {prompts.length} / 8
                    </span>
                  </span>
                  <textarea
                    id={`${id}-prompts`}
                    className="lens-prompts-textarea"
                    value={promptsText}
                    onChange={(event) => setPromptsText(event.target.value)}
                    rows={5}
                    aria-describedby={`${id}-prompt-help`}
                    required
                  />
                  <span id={`${id}-prompt-help`} className="lens-field-help">
                    One question per line. Up to 8 prompts, 500 characters each.
                  </span>
                </label>
                <button
                  className="lens-example-button"
                  type="button"
                  onClick={() =>
                    setPromptsText(defaultPrompts(brand).join("\n"))
                  }
                >
                  <Sparkles size={13} /> Use example prompts
                </button>

                <div className="lens-field-section-label">
                  <span>03</span> THE ANSWER ENGINES
                </div>
                <div
                  className="lens-engine-grid"
                  role="group"
                  aria-label="Answer engines"
                >
                  {engineOptions.map((engine) => {
                    const selected = engines.includes(engine.id);
                    return (
                      <button
                        type="button"
                        key={engine.id}
                        className={`lens-engine-option ${selected ? "is-selected" : ""}`}
                        aria-pressed={selected}
                        onClick={() =>
                          setEngines((previous) =>
                            selected
                              ? previous.filter((value) => value !== engine.id)
                              : [...previous, engine.id],
                          )
                        }
                      >
                        <span
                          className={`lens-engine-symbol ${engine.className}`}
                        >
                          {engine.symbol}
                        </span>
                        <span className="lens-engine-name">
                          {engine.label}
                          <small>{engine.description}</small>
                        </span>
                        <span className="lens-engine-check">
                          {selected ? (
                            <Check size={12} strokeWidth={2.7} />
                          ) : (
                            <Plus size={12} />
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <details
                  className="lens-token-details"
                  open={serverConfigured === false && !token}
                >
                  <summary>
                    <span>
                      <KeyRound size={14} />{" "}
                      {serverConfigured
                        ? "API credentials"
                        : "Connect your Treg account"}
                    </span>
                    <ChevronDown size={14} />
                  </summary>
                  <div className="lens-token-details-body">
                    <label
                      className="lens-dialog-field"
                      htmlFor={`${id}-token`}
                    >
                      Treg API token
                      {serverConfigured && (
                        <span className="lens-field-optional">optional</span>
                      )}
                      <input
                        id={`${id}-token`}
                        type="password"
                        value={apiToken}
                        onChange={(event) => setApiToken(event.target.value)}
                        placeholder={
                          serverConfigured
                          ? "Using your signed-in key"
                            : "Enter your Treg API token"
                        }
                        autoComplete="off"
                        spellCheck={false}
                      />
                    </label>
                    <p className="lens-field-help">
                      {serverConfigured
                        ? "Your signed-in key pays for this audit. Add a token to use a different account."
                        : "Your token is used for this audit and is never saved to disk."}{" "}
                      <a
                        href="https://treg.to/aeo"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Get a token <ExternalLink size={10} />
                      </a>
                    </p>
                  </div>
                </details>
              </fieldset>
              {runError && (
                <div
                  role="alert"
                  className="lens-dialog-notice lens-dialog-notice-error"
                >
                  {runError}
                </div>
              )}
              {running && (
                <div
                  className="lens-audit-progress"
                  role="status"
                  aria-live="polite"
                >
                  <div className="lens-progress-heading">
                    <LoaderCircle size={18} className="lens-spin" />
                    <strong>Listening to the answer engines…</strong>
                  </div>
                  <p>
                    Collecting {prompts.length * engines.length} real answers,
                    citations, and brand mentions. This can take a few minutes.
                    Your audit continues if you close this window.
                  </p>
                  <div className="lens-indeterminate-track">
                    <span />
                  </div>
                </div>
              )}
            </div>
            <div className="lens-dialog-footer">
              <div className="lens-audit-estimate" aria-live="polite">
                <span className="lens-estimate-label">
                  ESTIMATED API COST{" "}
                  <CircleHelp
                    size={12}
                    aria-label="Pricing comes directly from the Treg toolkit"
                  />
                </span>
                {estimateLoading ? (
                  <span className="lens-estimate-value lens-estimate-loading">
                    Calculating…
                  </span>
                ) : estimate ? (
                  <span className="lens-estimate-value">
                    {money(estimate.totalCostUsd)}{" "}
                    <small>for {estimate.callCount} requests</small>
                  </span>
                ) : (
                  <span className="lens-estimate-empty">
                    {estimateError || "Choose prompts and engines"}
                  </span>
                )}
              </div>
              <button
                className="lens-dialog-primary"
                type="submit"
                disabled={
                  !validForm ||
                  !estimate ||
                  estimateLoading ||
                  running ||
                  (serverConfigured === false && !apiToken.trim())
                }
              >
                {running ? (
                  <>
                    <LoaderCircle size={16} className="lens-spin" /> Running
                    audit
                  </>
                ) : (
                  <>
                    Run visibility audit <ArrowRight size={16} />
                  </>
                )}
              </button>
              <p className="lens-cost-note">
                {estimate?.note ||
                  "Live requests use your Treg credits. Nothing is charged until you run an audit."}
              </p>
              {estimate && (
                <details className="lens-pricing-details">
                  <summary>
                    View price breakdown <ChevronDown size={11} />
                  </summary>
                  <div>
                    {estimate.byEngine.map((engine) => (
                      <span key={engine.engine}>
                        <span>
                          {engineOptions.find(
                            (option) => option.id === engine.engine,
                          )?.label ?? engine.engine}{" "}
                          · {engine.calls} × {money(engine.costPerCallUsd)}
                        </span>
                        <strong>{money(engine.subtotalUsd)}</strong>
                      </span>
                    ))}
                  </div>
                </details>
              )}
            </div>
          </form>
        </>
      )}
    </DialogFrame>
  );
}

export default AuditDialog;
