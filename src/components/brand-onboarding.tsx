"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  ArrowLeft, ArrowRight, ArrowUpRight, Check, CheckCircle2, ChevronDown,
  CircleAlert, Globe2, LoaderCircle, LockKeyhole, Plus, ScanLine, Sparkles, X,
} from "lucide-react";
import { SUPPORTED_MARKET, type BuyerQuestion, type BuyerQuestionIntent, type CompetitorDetail, type MeasurementMarket, type OnboardingResearch, type Project } from "@/lib/workspace-data";
import { appendResearchReceipt } from "@/lib/workspace-onboarding";
import { safeEvidenceUrl } from "@/lib/workspace-profile";
import { editCompetitor, inferQuestionIntent, onboardingWebsite as website, QUESTION_INTENT_LABELS, starterQuestionIndexes } from "@/lib/onboarding-review";
import MarketingLogo from "./marketing-logo";
import "./marketing.css";
import "./brand-onboarding.css";

type Estimate = {
  kind: "estimate";
  totalCostUsd: number;
  currency: "USD";
  note: string;
  pricedAt: string;
};
type Research = OnboardingResearch;
type Competitor = CompetitorDetail & { id: string; suggested?: boolean };
type Question = BuyerQuestion & { id: string; selected: boolean };
type Step = 0 | 1 | 2;
type Draft = {
  version: 1;
  step: Step;
  url: string;
  brand: string;
  domain: string;
  description: string;
  audience: string;
  market: MeasurementMarket;
  competitors: Competitor[];
  questions: Question[];
  receipt: Research | null;
  receipts: Research[];
  interrupted: boolean;
};
export type BrandOnboardingProps = {
  initialProject: Project;
  initialPrompts: string[];
  storageKey: string;
  onComplete: (
    data: { project: Project; prompts: string[] },
    openAudit: boolean,
  ) => Promise<boolean>;
  onLogout?: () => void;
  error?: string;
  recovery?: ReactNode;
};

const subscribe = () => () => {};
const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD",
    minimumFractionDigits: 2, maximumFractionDigits: 4,
  }).format(value);
const text = (value: unknown, limit: number) =>
  typeof value === "string" ? value.slice(0, limit) : "";
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const unique = (values: string[]) => {
  const seen = new Set<string>();
  return values.map((value) => value.trim()).filter((value) => {
    const key = value.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

function safeLink(value: string) {
  return safeEvidenceUrl(value) ?? "";
}

function readQuestion(value: Record<string, unknown>, fallback: BuyerQuestion["provenance"] = "manual"): BuyerQuestion {
  const wording = text(value.text, 500);
  return {
    text: wording,
    intent: typeof value.intent === "string" && Object.hasOwn(QUESTION_INTENT_LABELS, value.intent)
      ? value.intent as BuyerQuestionIntent : inferQuestionIntent(wording),
    provenance: value.provenance === "generated" || value.provenance === "discovered" || value.provenance === "manual" ? value.provenance : fallback,
    ...(text(value.reason, 240) ? { reason: text(value.reason, 240) } : {}),
  };
}

function readReceipt(value: unknown): Research | null {
  if (!object(value) || value.kind !== "research") return null;
  const cost = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : null;
  const input = object(value.input) && object(value.input.market) &&
    value.input.market.country === "US" && value.input.market.language === "en" &&
    (value.input.audience === undefined || typeof value.input.audience === "string")
    ? value.input : null;
  const inputUrl = input ? safeLink(text(input.url, 2048)) : "";
  return {
    kind: "research", url: text(value.url, 2048), domain: text(value.domain, 200),
    ...(input && inputUrl ? { input: {
      url: inputUrl, market: { ...SUPPORTED_MARKET },
      ...(input.audience !== undefined ? { audience: text(input.audience, 600) } : {}),
    } } : {}),
    brand: text(value.brand, 100), description: text(value.description, 600),
    audience: text(value.audience, 600), market: { ...SUPPORTED_MARKET },
    competitors: Array.isArray(value.competitors) ? value.competitors.filter(object).slice(0, 5).map((c) => ({
      name: text(c.name, 100), domain: text(c.domain, 200), reason: text(c.reason, 240), sourceUrl: safeLink(text(c.sourceUrl, 2048)) || undefined,
    })) : [],
    questions: Array.isArray(value.questions) ? value.questions.filter((q): q is string => typeof q === "string").slice(0, 8).map((q) => q.slice(0, 500)) : [],
    buyerQuestions: Array.isArray(value.buyerQuestions) ? value.buyerQuestions.filter(object).slice(0, 16).map((q) => readQuestion(q, "generated")).filter((q) => q.text.trim()) : [],
    sources: Array.isArray(value.sources) ? value.sources.filter(object).slice(0, 12).map((s) => ({ title: text(s.title, 200), url: safeLink(text(s.url, 2048)) })).filter((s) => s.url) : [],
    totalCostUsd: value.costKnown === true ? cost(value.totalCostUsd) : null, knownCostUsd: cost(value.knownCostUsd) ?? 0,
    costKnown: value.costKnown === true && cost(value.totalCostUsd) !== null,
    errors: Array.isArray(value.errors) ? value.errors.filter(object).slice(0, 10).map((e) => ({ step: "research" as const, error: text(e.error, 1000) })) : [],
    callIds: Array.isArray(value.callIds) ? value.callIds.filter((id): id is string => typeof id === "string").slice(0, 8).map((id) => id.slice(0, 200)) : [],
    completedAt: text(value.completedAt, 40),
  };
}

function restore(key: string, project: Project, prompts: string[]): Draft {
  const base: Draft = {
    version: 1, step: 0, url: project.domain, brand: project.brand, domain: project.domain,
    description: project.description ?? "", audience: project.audience ?? "", market: { ...SUPPORTED_MARKET },
    competitors: project.competitors.slice(0, 8).map((name, i) => ({ ...project.competitorDetails?.find((c) => c.name.toLowerCase() === name.toLowerCase()), id: `initial-c-${i}`, name })),
    questions: (project.buyerQuestions?.length ? project.buyerQuestions.slice(0, 16) : (prompts.length ? prompts.slice(0, 8) : [""]).map((value) => ({ text: value, intent: inferQuestionIntent(value, project.brand), provenance: "manual" as const })))
      .map((question, i) => ({ ...question, id: `initial-q-${i}`, selected: prompts.some((prompt) => prompt.toLowerCase() === question.text.toLowerCase()) || !question.text })),
    receipt: null, receipts: project.researchReceipts ?? [], interrupted: false,
  };
  try {
    const raw = localStorage.getItem(key);
    if (!raw || raw.length > 500_000) return base;
    const saved: unknown = JSON.parse(raw);
    if (!object(saved) || saved.version !== 1) return base;
    return {
      version: 1, step: saved.step === 1 || saved.step === 2 ? saved.step : 0,
      url: text(saved.url, 2048), brand: text(saved.brand, 100),
      domain: text(saved.domain, 200), description: text(saved.description, 1000),
      audience: text(saved.audience, 600), market: { ...SUPPORTED_MARKET },
      competitors: Array.isArray(saved.competitors) ? saved.competitors.filter(object).slice(0, 8).map((c, i) => ({
        id: `restored-c-${i}`, name: text(c.name, 100), domain: text(c.domain, 200), reason: text(c.reason, 240), sourceUrl: safeLink(text(c.sourceUrl, 2048)) || undefined, suggested: c.suggested === true,
      })) : [],
      questions: Array.isArray(saved.questions) ? saved.questions.filter(object).slice(0, 16).map((q, i) => ({
        ...readQuestion(q, saved.receipt ? "generated" : "manual"), id: `restored-q-${i}`, selected: q.selected === true,
      })) : [],
      receipts: Array.isArray(saved.receipts) ? saved.receipts.map(readReceipt).filter((r): r is Research => !!r).slice(-5) : base.receipts,
      receipt: readReceipt(saved.receipt), interrupted: saved.interrupted === true,
    };
  } catch { return base; }
}

/** Mount after hydration so the first form already contains its recovered draft. */
export default function BrandOnboarding(props: BrandOnboardingProps) {
  const ready = useSyncExternalStore(subscribe, () => true, () => false);
  if (!ready) return <div className="brand-onboarding ob-loading" role="status"><LoaderCircle className="ob-spin" size={22} /> Opening your brand setup…</div>;
  return <OnboardingForm key={props.storageKey} {...props} />;
}

function OnboardingForm({ initialProject, initialPrompts, storageKey, onComplete, onLogout, error: externalError, recovery }: BrandOnboardingProps) {
  const id = useId();
  const draftKey = `${storageKey}:onboarding:v1`;
  const [draft, setDraft] = useState(() => restore(draftKey, initialProject, initialPrompts));
  const [quote, setQuote] = useState<Estimate | null>(null);
  const [busy, setBusy] = useState<"quote" | "research" | "save" | null>(null);
  const [error, setError] = useState("");
  const [urlError, setUrlError] = useState("");
  const [notice, setNotice] = useState("");
  const [storageWarning, setStorageWarning] = useState(false);
  const locked = useRef(false);
  const done = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const researchButton = useRef<HTMLButtonElement>(null);
  const urlInput = useRef<HTMLInputElement>(null);
  const lastStep = useRef(draft.step);
  const competitors = unique(draft.competitors.map((c) => c.name));
  const prompts = unique(draft.questions.filter((q) => q.selected).map((q) => q.text));
  const selectedCount = draft.questions.filter((q) => q.selected).length;
  const invalidQuestions = !prompts.length || selectedCount > 8 || draft.questions.some((q) => q.selected && !q.text.trim());
  const researchStale = !!draft.receipt && (
    draft.receipt.domain.replace(/^www\./, "").toLowerCase() !== draft.domain.replace(/^www\./, "").toLowerCase() ||
    (draft.receipt.audience ?? "").trim() !== draft.audience.trim()
  );

  useEffect(() => {
    if (done.current) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify(draft));
    } catch {
      // Manual setup can continue; paid research requires a saved interruption marker.
      if (!storageWarning) queueMicrotask(() => setStorageWarning(true));
    }
  }, [draft, draftKey, storageWarning]);

  useEffect(() => {
    if (lastStep.current !== draft.step) {
      lastStep.current = draft.step;
      heading.current?.focus();
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  }, [draft.step]);
  useEffect(() => {
    if (quote) researchButton.current?.focus();
  }, [quote]);

  useEffect(() => {
    if (busy !== "research" && busy !== "save") return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  function update(patch: Partial<Draft>) {
    setError("");
    if (patch.url !== undefined || patch.audience !== undefined || patch.market !== undefined) setQuote(null);
    setDraft((current) => ({ ...current, ...patch }));
  }
  function navigate(step: Step) {
    if (!locked.current) update({ step });
  }
  function forWebsite(input: ReturnType<typeof website>): Draft {
    const previousDomain = draft.domain.toLowerCase().replace(/^www\./, "");
    const changed = previousDomain && previousDomain !== input.domain;
    if (!changed) return { ...draft, ...input };
    setNotice("New website, fresh profile. We cleared the previous brand’s suggestions so you can review this business on its own.");
    return {
      ...draft, ...input, brand: "", description: "", competitors: [],
      questions: [{ id: crypto.randomUUID(), text: "", selected: true, intent: "other", provenance: "manual" }],
      // Keep the previous billing receipt inspectable even when its suggestions are cleared.
    };
  }

  async function estimate(event: React.FormEvent) {
    event.preventDefault();
    if (locked.current) return;
    let input: ReturnType<typeof website>;
    try { input = website(draft.url); }
    catch (failure) { setUrlError((failure as Error).message); urlInput.current?.focus(); return; }
    locked.current = true;
    setBusy("quote");
    setQuote(null);
    setError("");
    setUrlError("");
    setDraft(forWebsite(input));
    try {
      const response = await fetch("/api/aeo/onboard", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: input.url, audience: draft.audience.trim(), market: draft.market, estimateOnly: true }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "The estimate is unavailable. You can still set up your brand manually.");
      if (data.kind !== "estimate" || typeof data.totalCostUsd !== "number" || !Number.isFinite(data.totalCostUsd) || data.totalCostUsd < 0)
        throw new Error("The estimate is unavailable. You can still set up your brand manually.");
      setQuote(data);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Couldn’t load an estimate. Try again or set up manually.");
    } finally {
      locked.current = false;
      setBusy(null);
    }
  }

  async function research() {
    if (locked.current || !quote || draft.interrupted) return;
    locked.current = true;
    setBusy("research");
    setError("");
    const pending = { ...draft, interrupted: true };
    // Write before sending: closing the tab must not make a paid request look unsubmitted.
    try {
      const encoded = JSON.stringify(pending);
      localStorage.setItem(draftKey, encoded);
      if (localStorage.getItem(draftKey) !== encoded) throw new Error("Draft was not saved.");
    } catch {
      setStorageWarning(true);
      setError("Research has not started. Browser storage must be available to remember a paid request. Enable storage and try again, or use free manual setup.");
      locked.current = false;
      setBusy(null);
      return;
    }
    setDraft(pending);
    try {
      const response = await fetch("/api/aeo/onboard", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: draft.url, audience: draft.audience.trim(), market: draft.market, maxCostUsd: quote.totalCostUsd }),
      });
      const data = await response.json();
      if (!response.ok) {
        // Infrastructure failures can happen after submission. Only documented
        // pre-submission refusals establish that no paid call was started.
        if ([400, 401, 403, 409, 415, 422, 429].includes(response.status))
          setDraft((current) => ({ ...current, interrupted: false }));
        setQuote(null);
        throw new Error(response.status >= 500
          ? "Research was interrupted. A provider request may have completed. Check your Treg activity before requesting research again."
          : typeof data.error === "string" ? data.error : "Research could not start. Get a fresh estimate or continue manually.");
      }
      const receipt = readReceipt(data);
      if (!receipt) throw new Error("The research response was interrupted. Check your Treg activity before starting another request.");
      const suggestions: BuyerQuestion[] = receipt.questions.map((question) =>
        receipt.buyerQuestions?.find((item) => item.text.trim().toLowerCase() === question.trim().toLowerCase()) ??
        { text: question, intent: inferQuestionIntent(question, receipt.brand), provenance: "generated" });
      const starters = starterQuestionIndexes(suggestions);
      const next: Draft = {
        ...draft, step: 1, interrupted: false, receipt,
        receipts: appendResearchReceipt(draft.receipts, receipt),
        domain: receipt.domain || draft.domain,
        brand: receipt.brand || draft.brand,
        description: receipt.description || draft.description,
        audience: draft.audience || receipt.audience || "",
        competitors: receipt.competitors.map((c) => ({ ...c, id: crypto.randomUUID(), suggested: true })),
        questions: (suggestions.length ? suggestions : [{ text: "", intent: "other" as const, provenance: "manual" as const }])
          .map((question, i) => ({ ...question, id: crypto.randomUUID(), selected: !question.text || starters.includes(i) })),
      };
      try { localStorage.setItem(draftKey, JSON.stringify(next)); } catch { setStorageWarning(true); }
      setDraft(next);
      setNotice("");
      setQuote(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Research was interrupted. Check your Treg activity before starting another request.");
    } finally {
      locked.current = false;
      setBusy(null);
    }
  }

  function manual() {
    if (locked.current) return;
    try { setUrlError(""); update({ ...forWebsite(website(draft.url)), step: 1 }); }
    catch (failure) { setUrlError((failure as Error).message); urlInput.current?.focus(); }
  }
  function confirmBrand(event: React.FormEvent) {
    event.preventDefault();
    if (locked.current) return;
    try {
      const { domain } = website(draft.domain);
      if (!draft.brand.trim()) throw new Error("Add your brand name so Lens can identify mentions.");
      if (competitors.some((name) => name.toLowerCase() === draft.brand.trim().toLowerCase()))
        throw new Error("Remove your own brand from the competitor list.");
      const reviewedCompetitors = draft.competitors.map((competitor, index) => {
        if (!competitor.name.trim()) throw new Error(`Name competitor ${index + 1}, or remove its empty row.`);
        if (!competitor.domain?.trim()) return { ...competitor, domain: undefined };
        let normalized: string;
        try { normalized = website(competitor.domain).domain; }
        catch { throw new Error(`Check competitor ${index + 1}’s website, or leave it blank.`); }
        if (normalized === domain) throw new Error("Remove your own website from the competitor list.");
        return { ...competitor, domain: normalized };
      });
      update({ domain, brand: draft.brand.trim(), competitors: reviewedCompetitors, step: 2 });
    } catch (failure) { setError((failure as Error).message); }
  }
  async function complete(openAudit: boolean) {
    if (locked.current) return;
    if (invalidQuestions) {
      setError("Choose 1–8 buyer questions, and fill in each selected question.");
      return;
    }
    locked.current = true;
    setBusy("save");
    setError("");
    try {
      const saved = await onComplete({
        project: {
          brand: draft.brand.trim(), domain: draft.domain, competitors,
          ...(draft.description.trim() ? { description: draft.description.trim() } : {}),
          audience: draft.audience.trim(), market: { ...SUPPORTED_MARKET },
          competitorDetails: competitors.map((name) => {
            const detail = draft.competitors.find((candidate) => candidate.name.trim().toLowerCase() === name.toLowerCase())!;
            return { name, ...(detail.domain ? { domain: detail.domain } : {}), ...(detail.reason ? { reason: detail.reason } : {}), ...(detail.sourceUrl ? { sourceUrl: detail.sourceUrl } : {}) };
          }),
          buyerQuestions: draft.questions.filter((question) => question.text.trim()).map((question) => ({
            text: question.text.trim(), intent: question.intent, provenance: question.provenance,
            ...(question.reason ? { reason: question.reason } : {}),
          })),
          researchReceipts: draft.receipt ? appendResearchReceipt(draft.receipts, draft.receipt) : draft.receipts,
          onboardingCompletedAt: new Date().toISOString(),
        },
        prompts,
      }, openAudit);
      if (!saved) {
        setError("Your setup hasn’t been saved yet. Your draft is still here. Resolve the workspace issue and try saving again.");
        return;
      }
      done.current = true;
      try { localStorage.removeItem(draftKey); } catch { /* The server save already succeeded. */ }
    } catch {
      setError("We couldn’t save your setup. Your draft is still here. Check your connection and try saving again.");
    } finally {
      locked.current = false;
      setBusy(null);
    }
  }

  return (
    <div className="brand-onboarding">
      <header className="ob-header">
        <MarketingLogo />
        <div className="ob-private"><LockKeyhole size={13} /> Your private workspace</div>
        {onLogout && <button className="ob-text-button" onClick={onLogout} disabled={!!busy}>Sign out</button>}
      </header>
      <main className="ob-main">
        <nav className="ob-progress" aria-label="Brand setup progress">
          {["Website", "Brand", "Questions"].map((label, index) => (
            <button key={label} type="button" aria-current={draft.step === index ? "step" : undefined}
              disabled={index > draft.step || !!busy} onClick={() => navigate(index as Step)}>
              <span className="ob-step-dot">{index < draft.step ? <Check size={13} /> : `0${index + 1}`}</span>
              {label}<span className="ob-step-line" aria-hidden="true" />
            </button>
          ))}
        </nav>
        <div className={`ob-layout ob-step-${draft.step}`}>
          <section className="ob-intro">
            <p className="ob-eyebrow"><span className="ob-pixel" /> A clearer picture starts here</p>
            <h1 ref={heading} tabIndex={-1}>
              {draft.step === 0 ? <>Put your brand<br /><span>in focus.</span></> : draft.step === 1 ? <>Does this<br /><span>sound like you?</span></> : <>Start with the<br /><span>right questions.</span></>}
            </h1>
            <p className="ob-lede">
              {draft.step === 0 ? "Start with your website and your buyers. Build a focused picture of your brand, its alternatives, and the questions customers might ask."
                : draft.step === 1 ? "A useful starting point, with you in control. Check your brand profile and choose the competitors you want to measure."
                  : "Choose the questions you want AI to answer about your market. Make them specific. Make them sound like your buyers."}
            </p>
            <div className="ob-context">
              {draft.step === 0 ? <FocusIllustration /> : <>
                <span className="ob-context-label">YOUR BRAND IN FOCUS</span>
                <strong>{draft.brand || draft.domain}</strong>
                <span className="ob-domain"><Globe2 size={14} />{draft.domain}</span>
                <div className="ob-context-stat"><span>{competitors.length} competitors</span><span>{prompts.length} buyer questions</span></div>
              </>}
            </div>
            <div className="ob-assurance"><CheckCircle2 size={16} /><p>Review everything before it runs. Your first visibility audit has its own cost approval.</p></div>
          </section>

          <div className="ob-panel-wrap">
            <section className="ob-panel" aria-label={["Your website", "Review your brand", "Review buyer questions"][draft.step]}>
              {draft.step === 0 ? (
                <>
                  <div className="ob-panel-title"><span className="ob-icon"><Globe2 size={22} /></span><div><h2>Let’s meet your brand.</h2><p>Start with the website your customers visit.</p></div></div>
                  <MarketScope />
                  <form onSubmit={estimate}>
                    <label className="ob-field" htmlFor={`${id}-url`}>
                      <span id={`${id}-url-label`}>Website URL</span>
                      <div className="ob-url-input"><Globe2 size={17} /><input ref={urlInput} id={`${id}-url`} aria-labelledby={`${id}-url-label`} aria-invalid={!!urlError} aria-describedby={`${id}-url-help${urlError ? ` ${id}-url-error` : ""}`} value={draft.url} type="text" inputMode="url" autoComplete="url" autoCapitalize="none" spellCheck={false} placeholder="yourbrand.com" maxLength={2048} required disabled={!!busy}
                        onChange={(event) => { setUrlError(""); update({ url: event.target.value }); }}
                        onBlur={() => { if (draft.url.trim()) { try { website(draft.url); setUrlError(""); } catch (failure) { setUrlError((failure as Error).message); } } }} /></div>
                      <span id={`${id}-url-help`} className="ob-help">A public website works best. URL tracking parameters are removed.</span>
                      {urlError && <span id={`${id}-url-error`} className="ob-field-error" role="alert">{urlError}</span>}
                    </label>
                    <BuyerContext id={`${id}-audience`} value={draft.audience} disabled={!!busy} onChange={(audience) => update({ audience })} />
                    {!quote && <button className="ob-button ob-primary ob-wide" type="submit" disabled={!!busy}>
                      {busy === "quote" ? <><LoaderCircle className="ob-spin" size={17} /> Getting your estimate…</> : <>Get research estimate <ArrowRight size={17} /></>}
                    </button>}
                  </form>
                  {quote && <div className="ob-quote">
                    <div><span className="ob-eyebrow">ONE-TIME BRAND RESEARCH</span><strong>{money(quote.totalCostUsd)}<small>USD maximum</small></strong></div>
                    <p>Research your website and the web for a brand profile, suggested competitors, and buyer questions.</p>
                    <div className="ob-research-scope"><strong>{draft.domain}</strong><span>United States · English</span>{draft.audience.trim() && <p>Buyer context: {draft.audience.trim()}</p>}</div>
                    <button ref={researchButton} type="button" className="ob-button ob-primary ob-wide" onClick={research} disabled={!!busy || draft.interrupted}>
                      {busy === "research" ? <><LoaderCircle className="ob-spin" size={17} /> Researching your brand…</> : <><Sparkles size={16} /> Research my brand · {money(quote.totalCostUsd)} maximum</>}
                    </button>
                    <span className="ob-help">Uses your Treg credits. Prices are checked again before the request starts. This approval covers research only.</span>
                  </div>}
                  {busy === "research" && <div className="ob-research-status" role="status">
                    <div className="ob-research-track"><span /></div>
                    <strong>Waiting for your research results.</strong>
                    <p>Research can take a minute. No progress percentage is available. Keep this tab open to receive the results; a reload will remember that a request was submitted and will never repeat it automatically.</p>
                  </div>}
                  <div className="ob-manual"><span>Prefer to add your own?</span><button className="ob-text-button" type="button" onClick={manual} disabled={!!busy}>Set up manually <ArrowRight size={14} /></button></div>
                  <div className="ob-free"><LockKeyhole size={13} /> Estimates and manual setup are free.</div>
                </>
              ) : draft.step === 1 ? (
                <form onSubmit={confirmBrand}>
                  <div className="ob-panel-title"><span className="ob-icon"><ScanLine size={22} /></span><div><h2>Your brand, in your words.</h2><p>Everything here is editable.</p></div></div>
                  <MarketScope />
                  {researchStale && <p className="ob-suggestion-note">Your website or buyer context has changed since research. Review these earlier suggestions for relevance. The original receipt is kept below.</p>}
                  <fieldset disabled={!!busy} className="ob-fields">
                    <label className="ob-field" htmlFor={`${id}-brand`}>Brand name<input id={`${id}-brand`} value={draft.brand} maxLength={100} required placeholder="Your brand name" onChange={(event) => update({ brand: event.target.value })} /></label>
                    <label className="ob-field" htmlFor={`${id}-domain`}>Brand website<input id={`${id}-domain`} value={draft.domain} maxLength={200} required autoCapitalize="none" spellCheck={false} onChange={(event) => update({ domain: event.target.value })} /></label>
                    <label className="ob-field" htmlFor={`${id}-description`}>Business description <span className="ob-optional">optional</span><textarea id={`${id}-description`} rows={3} value={draft.description} maxLength={1000} placeholder="What do you do, and who do you help?" onChange={(event) => update({ description: event.target.value })} /></label>
                    <BuyerContext id={`${id}-audience`} value={draft.audience} disabled={!!busy} onChange={(audience) => update({ audience })} />
                    <div className="ob-section-title"><div><h3>Your competitive set</h3><p>Add the brands your buyers compare you with.</p></div><span>{draft.competitors.length}/8</span></div>
                    <div className="ob-competitors">
                      {draft.competitors.map((competitor, i) => <div className="ob-competitor" key={competitor.id}>
                        <div className="ob-row-number">{String(i + 1).padStart(2, "0")}</div>
                        <div className="ob-competitor-content">
                          <label className="ob-visually-hidden" htmlFor={`${id}-competitor-${competitor.id}`}>Competitor {i + 1}</label>
                          <input id={`${id}-competitor-${competitor.id}`} value={competitor.name} maxLength={100} placeholder="Competitor name" onChange={(event) => update({ competitors: draft.competitors.map((c) => c.id === competitor.id ? { ...editCompetitor(c, { name: event.target.value }), suggested: false } : c) })} />
                          <label className="ob-competitor-website" htmlFor={`${id}-competitor-domain-${competitor.id}`}><span>Website <small>optional</small></span><input id={`${id}-competitor-domain-${competitor.id}`} aria-label={`Competitor ${i + 1} website`} value={competitor.domain ?? ""} maxLength={200} inputMode="url" autoCapitalize="none" spellCheck={false} placeholder="competitor.com" onChange={(event) => update({ competitors: draft.competitors.map((c) => c.id === competitor.id ? { ...editCompetitor(c, { domain: event.target.value }), suggested: false } : c) })} /></label>
                          <span className="ob-provenance">{competitor.suggested || competitor.reason || competitor.sourceUrl ? "Suggested competitor · verify this fit" : "Added or edited by you"}</span>
                          {competitor.reason && <p>{competitor.reason}</p>}
                          {competitor.sourceUrl && safeLink(competitor.sourceUrl) && <a className="ob-evidence-link" href={safeLink(competitor.sourceUrl)} target="_blank" rel="noopener noreferrer">View supporting source <ArrowUpRight size={12} /></a>}
                        </div>
                        <button className="ob-remove" type="button" aria-label={`Remove competitor ${i + 1}`} onClick={() => update({ competitors: draft.competitors.filter((c) => c.id !== competitor.id) })}><X size={16} /></button>
                      </div>)}
                    </div>
                    {draft.competitors.length < 8 && <button className="ob-add" type="button" onClick={() => update({ competitors: [...draft.competitors, { id: crypto.randomUUID(), name: "" }] })}><Plus size={15} /> Add competitor</button>}
                  </fieldset>
                  <div className="ob-form-actions"><button className="ob-text-button" type="button" onClick={() => navigate(0)} disabled={!!busy}><ArrowLeft size={14} /> Website</button><button className="ob-button ob-primary" type="submit" disabled={!!busy}>Continue to buyer questions <ArrowRight size={16} /></button></div>
                </form>
              ) : (
                <>
                  <div className="ob-panel-title"><span className="ob-icon"><Sparkles size={21} /></span><div><h2>What would your buyers ask?</h2><p>Start with a focused set. Select up to 8 questions.</p></div></div>
                  <MarketScope compact />
                  {draft.questions.some((question) => question.provenance === "generated") && <p className="ob-suggestion-note">AI-generated suggestions based on web research. Review for relevance; these are not measured search volumes. Intent labels are suggestions you can change.</p>}
                  <fieldset disabled={!!busy} className="ob-fields">
                    <div className="ob-starter"><div><strong>A focused first check</strong><p>Three questions across different buyer needs keep your first audit manageable. You can expand the set anytime.</p></div><button className="ob-text-button" type="button" disabled={!draft.questions.some((question) => question.text.trim())} onClick={() => { const indexes = starterQuestionIndexes(draft.questions); update({ questions: draft.questions.map((question, index) => ({ ...question, selected: indexes.includes(index) })) }); }}>Use starter selection</button></div>
                    <div className="ob-question-count" role="status"><span>BUYER QUESTIONS</span><strong>{selectedCount} of 8 selected</strong></div>
                    <div className="ob-questions">
                      {(Object.keys(QUESTION_INTENT_LABELS) as BuyerQuestionIntent[]).filter((intent) => draft.questions.some((question) => question.intent === intent)).map((intent) => <section className="ob-question-group" key={intent} aria-labelledby={`${id}-group-${intent}`}><h3 id={`${id}-group-${intent}`}>{QUESTION_INTENT_LABELS[intent]}</h3>{draft.questions.map((question, i) => ({ question, i })).filter(({ question }) => question.intent === intent).map(({ question, i }) => <div className={`ob-question ${question.selected ? "is-selected" : ""}`} key={question.id}>
                        <input className="ob-check" type="checkbox" checked={question.selected} aria-label={`Track buyer question ${i + 1}`} disabled={!question.selected && selectedCount >= 8}
                          onChange={(event) => update({ questions: draft.questions.map((q) => q.id === question.id ? { ...q, selected: event.target.checked } : q) })} />
                        <div className="ob-question-content"><label htmlFor={`${id}-question-${question.id}`}>Buyer question {i + 1}</label><textarea id={`${id}-question-${question.id}`} value={question.text} maxLength={500} rows={2} placeholder="What would a customer ask before choosing a product like yours?"
                          onChange={(event) => update({ questions: draft.questions.map((q) => q.id === question.id ? { ...q, text: event.target.value, provenance: "manual", reason: undefined } : q) })} />
                          <div className="ob-question-meta"><label htmlFor={`${id}-intent-${question.id}`}><span className="ob-visually-hidden">Intent for buyer question {i + 1}</span><select id={`${id}-intent-${question.id}`} aria-label={`Intent for buyer question ${i + 1}`} value={question.intent} onChange={(event) => { update({ questions: draft.questions.map((q) => q.id === question.id ? { ...q, intent: event.target.value as BuyerQuestionIntent } : q) }); requestAnimationFrame(() => document.getElementById(`${id}-intent-${question.id}`)?.focus()); }}>{(Object.keys(QUESTION_INTENT_LABELS) as BuyerQuestionIntent[]).map((value) => <option key={value} value={value}>{QUESTION_INTENT_LABELS[value]}</option>)}</select></label><span className="ob-provenance">{question.provenance === "generated" ? "AI suggestion" : question.provenance === "discovered" ? "Observed discovery" : "Edited by you"}</span></div>
                          {question.reason && <p className="ob-question-reason">{question.reason}</p>}
                        </div>
                        <button className="ob-remove" type="button" aria-label={`Remove buyer question ${i + 1}`} onClick={() => update({ questions: draft.questions.filter((q) => q.id !== question.id) })}><X size={16} /></button>
                      </div>)}</section>)}
                    </div>
                    {draft.questions.length < 16 && <button className="ob-add" type="button" onClick={() => update({ questions: [...draft.questions, { id: crypto.randomUUID(), text: "", selected: selectedCount < 8, intent: "other", provenance: "manual" }] })}><Plus size={15} /> Add buyer question</button>}
                  </fieldset>
                  <div className="ob-ready-note"><CheckCircle2 size={17} /><div><strong>{prompts.length} {prompts.length === 1 ? "question" : "questions"} in your first plan.</strong><p>Only selected questions are sent to answer engines. Unselected ideas and research receipts stay in your saved profile. Choose engines and approve pricing next; saving spends no credits and enables no schedule.</p></div></div>
                  <div className="ob-save-actions">
                    <button className="ob-button ob-primary ob-wide" type="button" onClick={() => void complete(true)} disabled={!!busy || invalidQuestions}>
                      {busy === "save" ? <><LoaderCircle size={17} className="ob-spin" /> Saving your workspace…</> : <>Save and review first audit <ArrowRight size={17} /></>}
                    </button>
                    <button className="ob-text-button ob-save-later" type="button" onClick={() => void complete(false)} disabled={!!busy || invalidQuestions}>Save and open workspace</button>
                    <button className="ob-text-button" type="button" onClick={() => navigate(1)} disabled={!!busy}><ArrowLeft size={14} /> Brand</button>
                  </div>
                </>
              )}

              {(error || externalError) && <div className="ob-alert" role="alert"><CircleAlert size={17} /><div>{error && <p>{error}</p>}{externalError && externalError !== error && <p>{externalError}</p>}</div></div>}
              {recovery}
              {notice && <p className="ob-suggestion-note ob-change-notice" role="status">{notice}</p>}
              {draft.interrupted && busy !== "research" && <div className="ob-alert ob-warning" role="alert"><CircleAlert size={17} /><div><strong>A research request may have completed.</strong><p>Check your <a href="https://treg.to/app" target="_blank" rel="noopener noreferrer">Treg activity <ArrowUpRight size={12} /></a> before requesting research again. Charges may be unknown. You can continue manually with the draft below.</p><button className="ob-text-button" onClick={() => update({ interrupted: false })} disabled={!!busy}>I’ve checked my Treg activity</button></div></div>}
            </section>

            {draft.receipt && <ResearchReceipt receipt={draft.receipt} currentDomain={draft.domain} />}
            <p className="ob-draft-note">{storageWarning ? "Browser storage is unavailable. Keep this tab open until your setup is saved." : "Your setup draft stays in this browser until you save your workspace."}</p>
          </div>
        </div>
      </main>
      <footer className="ob-footer"><span>Treg Lens / Brand setup</span><span>Made for your next move.</span></footer>
    </div>
  );
}

function MarketScope({ compact = false }: { compact?: boolean }) {
  return <div className={`ob-market ${compact ? "is-compact" : ""}`} aria-label="Measurement market"><div><Globe2 size={15} /><strong>United States · English</strong><span>Current coverage</span></div>{!compact && <p>Answer collection currently supports this market. Describe buyers elsewhere below, but results will still measure US / English answers.</p>}</div>;
}

function BuyerContext({ id, value, disabled, onChange }: { id: string; value: string; disabled: boolean; onChange: (value: string) => void }) {
  return <label className="ob-field" htmlFor={id}><span>Who are your buyers? <span className="ob-optional">optional</span></span><textarea id={id} aria-label="Who are your buyers?" aria-describedby={`${id}-help`} value={value} maxLength={600} rows={2} disabled={disabled} placeholder="For example: small US marketing teams choosing an affordable analytics tool." onChange={(event) => onChange(event.target.value)} /><span className="ob-help" id={`${id}-help`}>Their role, needs, and buying constraints make suggestions more relevant. {value.length}/600</span></label>;
}

export function ResearchReceipt({ receipt, currentDomain }: { receipt: Research; currentDomain?: string }) {
  const sourceDomain = (value: string) => {
    try { return new URL(value.includes("://") ? value : `https://${value}`).hostname.replace(/^www\./, "").toLowerCase(); }
    catch { return ""; }
  };
  const stale = !!currentDomain && sourceDomain(currentDomain) !== sourceDomain(receipt.domain || receipt.url);
  const sources = receipt.sources.filter((source) => safeLink(source.url));
  return (
    <details className="ob-receipt" open={receipt.errors.length ? true : undefined}>
      <summary><span><CheckCircle2 size={15} /> Research {receipt.errors.length ? "needs your review" : "received"}</span><span>{receipt.costKnown && receipt.totalCostUsd !== null ? money(receipt.totalCostUsd) : "Charge unknown"} <ChevronDown size={14} /></span></summary>
      <div className="ob-receipt-body">
        <p>Website researched: <strong>{receipt.domain || receipt.url}</strong></p>
        {stale && <p className="ob-receipt-error">This receipt belongs to a different website. It is preserved as research history, not evidence for your current brand.</p>}
        {receipt.completedAt && <p>Received {new Date(receipt.completedAt).toLocaleString()} · United States / English</p>}
        {receipt.input && <p>Submitted buyer context: {receipt.input.audience?.trim() || "None provided."}</p>}
        {receipt.audience && <p>Suggested buyer profile: {receipt.audience}</p>}
        {receipt.errors.map((issue, i) => <p className="ob-receipt-error" key={i}>{issue.error}</p>)}
        {!receipt.costKnown && <p>The provider didn’t confirm the full charge. Known charges: {money(receipt.knownCostUsd)}. Check Treg activity before repeating research.</p>}
        <p>Suggestions can be incomplete or inaccurate. Check your brand, competitors, and questions before saving.</p>
        {sources.length > 0 && <><strong>Research sources</strong><ul>{sources.map((source, i) => <li key={`${source.url}-${i}`}><a href={safeLink(source.url)} target="_blank" rel="noopener noreferrer">{source.title || new URL(source.url).hostname}<ArrowUpRight size={13} /></a></li>)}</ul></>}
        {receipt.callIds.length > 0 && <p className="ob-call-ids">Treg call IDs: {receipt.callIds.join(", ")}</p>}
      </div>
    </details>
  );
}

function FocusIllustration() {
  return (
    <div className="ob-focus-art" aria-hidden="true">
      <div className="ob-focus-grid" />
      <span className="ob-focus-label">FIND YOUR PLACE IN THE ANSWER</span>
      <div className="ob-focus-line"><i /><i /><i /></div>
      <div className="ob-focus-brand"><span /><strong>Your brand.</strong><span /></div>
      <div className="ob-focus-line is-last"><i /><i /><i /></div>
      <span className="ob-focus-status"><i /> A clearer picture awaits</span>
    </div>
  );
}
