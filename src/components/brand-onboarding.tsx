"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  ArrowLeft, ArrowRight, ArrowUpRight, Check, CheckCircle2, ChevronDown,
  CircleAlert, Globe2, LoaderCircle, LockKeyhole, Plus, ScanLine, Sparkles, X,
} from "lucide-react";
import type { Project } from "@/lib/workspace-data";
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
type Research = {
  kind: "research";
  url: string;
  domain: string;
  brand: string;
  description: string;
  competitors: { name: string; domain?: string; reason?: string }[];
  questions: string[];
  sources: { title: string; url: string }[];
  totalCostUsd: number | null;
  knownCostUsd: number;
  costKnown: boolean;
  errors: { step: string; error: string }[];
  callIds: string[];
  completedAt: string;
};
type Competitor = { id: string; name: string; domain?: string; reason?: string };
type Question = { id: string; text: string; selected: boolean };
type Step = 0 | 1 | 2;
type Draft = {
  version: 1;
  step: Step;
  url: string;
  brand: string;
  domain: string;
  description: string;
  competitors: Competitor[];
  questions: Question[];
  receipt: Research | null;
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

function website(value: string) {
  let parsed: URL;
  try { parsed = new URL(value.trim().includes("://") ? value.trim() : `https://${value.trim()}`); }
  catch { throw new Error("Enter a website such as yourbrand.com."); }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password ||
      !parsed.hostname.includes(".") || parsed.hostname.length > 200) {
    throw new Error("Use a public website URL without a username or password.");
  }
  parsed.hash = "";
  parsed.search = "";
  return { url: parsed.toString(), domain: parsed.hostname.replace(/^www\./, "").toLowerCase() };
}

function safeLink(value: string) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : "";
  } catch { return ""; }
}

function readReceipt(value: unknown): Research | null {
  if (!object(value) || value.kind !== "research") return null;
  const cost = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : null;
  return {
    kind: "research", url: text(value.url, 2048), domain: text(value.domain, 200),
    brand: text(value.brand, 100), description: text(value.description, 1000),
    competitors: Array.isArray(value.competitors) ? value.competitors.filter(object).slice(0, 8).map((c) => ({
      name: text(c.name, 100), domain: text(c.domain, 200), reason: text(c.reason, 500),
    })) : [],
    questions: Array.isArray(value.questions) ? value.questions.filter((q): q is string => typeof q === "string").slice(0, 16).map((q) => q.slice(0, 500)) : [],
    sources: Array.isArray(value.sources) ? value.sources.filter(object).slice(0, 20).map((s) => ({ title: text(s.title, 200), url: safeLink(text(s.url, 2048)) })).filter((s) => s.url) : [],
    totalCostUsd: cost(value.totalCostUsd), knownCostUsd: cost(value.knownCostUsd) ?? 0,
    costKnown: value.costKnown === true && cost(value.totalCostUsd) !== null,
    errors: Array.isArray(value.errors) ? value.errors.filter(object).slice(0, 10).map((e) => ({ step: text(e.step, 100), error: text(e.error, 1000) })) : [],
    callIds: Array.isArray(value.callIds) ? value.callIds.filter((id): id is string => typeof id === "string").slice(0, 10).map((id) => id.slice(0, 200)) : [],
    completedAt: text(value.completedAt, 50),
  };
}

function restore(key: string, project: Project, prompts: string[]): Draft {
  const base: Draft = {
    version: 1, step: 0, url: project.domain, brand: project.brand, domain: project.domain,
    description: project.description ?? "", competitors: project.competitors.slice(0, 8).map((name, i) => ({ id: `initial-c-${i}`, name })),
    questions: (prompts.length ? prompts.slice(0, 8) : [""]).map((value, i) => ({ id: `initial-q-${i}`, text: value, selected: true })),
    receipt: null, interrupted: false,
  };
  try {
    const raw = localStorage.getItem(key);
    if (!raw || raw.length > 100_000) return base;
    const saved: unknown = JSON.parse(raw);
    if (!object(saved) || saved.version !== 1) return base;
    return {
      version: 1, step: saved.step === 1 || saved.step === 2 ? saved.step : 0,
      url: text(saved.url, 2048), brand: text(saved.brand, 100),
      domain: text(saved.domain, 200), description: text(saved.description, 1000),
      competitors: Array.isArray(saved.competitors) ? saved.competitors.filter(object).slice(0, 8).map((c, i) => ({
        id: `restored-c-${i}`, name: text(c.name, 100), domain: text(c.domain, 200), reason: text(c.reason, 500),
      })) : [],
      questions: Array.isArray(saved.questions) ? saved.questions.filter(object).slice(0, 16).map((q, i) => ({
        id: `restored-q-${i}`, text: text(q.text, 500), selected: q.selected === true,
      })) : [],
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
  const [notice, setNotice] = useState("");
  const [storageWarning, setStorageWarning] = useState(false);
  const locked = useRef(false);
  const done = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const researchButton = useRef<HTMLButtonElement>(null);
  const lastStep = useRef(draft.step);
  const competitors = unique(draft.competitors.map((c) => c.name));
  const prompts = unique(draft.questions.filter((q) => q.selected).map((q) => q.text));
  const selectedCount = draft.questions.filter((q) => q.selected).length;
  const invalidQuestions = !prompts.length || selectedCount > 8 || draft.questions.some((q) => q.selected && !q.text.trim());

  useEffect(() => {
    if (done.current) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify(draft));
    } catch {
      // Storage is optional. A blocked/full browser must not prevent setup.
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
      questions: [{ id: crypto.randomUUID(), text: "", selected: true }],
      // Keep the previous billing receipt inspectable even when its suggestions are cleared.
    };
  }

  async function estimate(event: React.FormEvent) {
    event.preventDefault();
    if (locked.current) return;
    let input: ReturnType<typeof website>;
    try { input = website(draft.url); }
    catch (failure) { setError((failure as Error).message); return; }
    locked.current = true;
    setBusy("quote");
    setQuote(null);
    setError("");
    setDraft(forWebsite(input));
    try {
      const response = await fetch("/api/aeo/onboard", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: input.url, estimateOnly: true }),
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
    setDraft(pending);
    // Write before sending: closing the tab must not make a paid request look unsubmitted.
    try { localStorage.setItem(draftKey, JSON.stringify(pending)); } catch { setStorageWarning(true); }
    try {
      const response = await fetch("/api/aeo/onboard", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: draft.url, maxCostUsd: quote.totalCostUsd }),
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
      const next: Draft = {
        ...draft, step: 1, interrupted: false, receipt,
        domain: receipt.domain || draft.domain,
        brand: receipt.brand || draft.brand,
        description: receipt.description || draft.description,
        competitors: receipt.competitors.map((c) => ({ ...c, id: crypto.randomUUID() })),
        questions: (receipt.questions.length ? receipt.questions : [""]).map((q, i) => ({ id: crypto.randomUUID(), text: q, selected: i < 8 })),
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
    try { update({ ...forWebsite(website(draft.url)), step: 1 }); }
    catch (failure) { setError((failure as Error).message); }
  }
  function confirmBrand(event: React.FormEvent) {
    event.preventDefault();
    if (locked.current) return;
    try {
      const { domain } = website(draft.domain);
      if (!draft.brand.trim()) throw new Error("Add your brand name so Lens can identify mentions.");
      if (competitors.some((name) => name.toLowerCase() === draft.brand.trim().toLowerCase()))
        throw new Error("Remove your own brand from the competitor list.");
      update({ domain, brand: draft.brand.trim(), step: 2 });
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
              {draft.step === 0 ? "One website. A starting point for your brand, your competition, and the questions your next customers are asking."
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
                  <form onSubmit={estimate}>
                    <label className="ob-field" htmlFor={`${id}-url`}>
                      <span id={`${id}-url-label`}>Website URL</span>
                      <div className="ob-url-input"><Globe2 size={17} /><input id={`${id}-url`} aria-labelledby={`${id}-url-label`} aria-describedby={`${id}-url-help`} value={draft.url} type="text" inputMode="url" autoComplete="url" autoCapitalize="none" spellCheck={false} placeholder="yourbrand.com" maxLength={2048} required disabled={!!busy}
                        onChange={(event) => { setQuote(null); update({ url: event.target.value }); }} /></div>
                      <span id={`${id}-url-help`} className="ob-help">A public website works best. URL tracking parameters are removed.</span>
                    </label>
                    {!quote && <button className="ob-button ob-primary ob-wide" type="submit" disabled={!!busy}>
                      {busy === "quote" ? <><LoaderCircle className="ob-spin" size={17} /> Getting your estimate…</> : <>Get research estimate <ArrowRight size={17} /></>}
                    </button>}
                  </form>
                  {quote && <div className="ob-quote">
                    <div><span className="ob-eyebrow">ONE-TIME BRAND RESEARCH</span><strong>{money(quote.totalCostUsd)}<small>USD maximum</small></strong></div>
                    <p>Research your website and the web for a brand profile, suggested competitors, and buyer questions.</p>
                    <button ref={researchButton} type="button" className="ob-button ob-primary ob-wide" onClick={research} disabled={!!busy || draft.interrupted}>
                      {busy === "research" ? <><LoaderCircle className="ob-spin" size={17} /> Researching your brand…</> : <><Sparkles size={16} /> Research my brand · {money(quote.totalCostUsd)} maximum</>}
                    </button>
                    <span className="ob-help">Uses your Treg credits. Prices are checked again before the request starts.</span>
                  </div>}
                  {busy === "research" && <div className="ob-research-status" role="status">
                    <div className="ob-research-track"><span /></div>
                    <strong>Finding the context that matters.</strong>
                    <p>Research can take a minute. Keep this tab open so we can bring your results back.</p>
                  </div>}
                  <div className="ob-manual"><span>Prefer to add your own?</span><button className="ob-text-button" type="button" onClick={manual} disabled={!!busy}>Set up manually <ArrowRight size={14} /></button></div>
                  <div className="ob-free"><LockKeyhole size={13} /> Estimates and manual setup are free.</div>
                </>
              ) : draft.step === 1 ? (
                <form onSubmit={confirmBrand}>
                  <div className="ob-panel-title"><span className="ob-icon"><ScanLine size={22} /></span><div><h2>Your brand, in your words.</h2><p>Everything here is editable.</p></div></div>
                  <fieldset disabled={!!busy} className="ob-fields">
                    <label className="ob-field" htmlFor={`${id}-brand`}>Brand name<input id={`${id}-brand`} value={draft.brand} maxLength={100} required placeholder="Your brand name" onChange={(event) => update({ brand: event.target.value })} /></label>
                    <label className="ob-field" htmlFor={`${id}-domain`}>Brand website<input id={`${id}-domain`} value={draft.domain} maxLength={200} required autoCapitalize="none" spellCheck={false} onChange={(event) => update({ domain: event.target.value })} /></label>
                    <label className="ob-field" htmlFor={`${id}-description`}>Business description <span className="ob-optional">optional</span><textarea id={`${id}-description`} rows={3} value={draft.description} maxLength={1000} placeholder="What do you do, and who do you help?" onChange={(event) => update({ description: event.target.value })} /></label>
                    <div className="ob-section-title"><div><h3>Your competitive set</h3><p>Add the brands your buyers compare you with.</p></div><span>{draft.competitors.length}/8</span></div>
                    <div className="ob-competitors">
                      {draft.competitors.map((competitor, i) => <div className="ob-competitor" key={competitor.id}>
                        <div className="ob-row-number">{String(i + 1).padStart(2, "0")}</div>
                        <div className="ob-competitor-content">
                          <label className="ob-visually-hidden" htmlFor={`${id}-competitor-${competitor.id}`}>Competitor {i + 1}</label>
                          <input id={`${id}-competitor-${competitor.id}`} value={competitor.name} maxLength={100} placeholder="Competitor name" onChange={(event) => update({ competitors: draft.competitors.map((c) => c.id === competitor.id ? { id: c.id, name: event.target.value } : c) })} />
                          {competitor.domain && <span className="ob-competitor-domain">{competitor.domain}</span>}
                          {competitor.reason && <p>{competitor.reason}</p>}
                        </div>
                        <button className="ob-remove" type="button" aria-label={`Remove competitor ${i + 1}`} onClick={() => update({ competitors: draft.competitors.filter((c) => c.id !== competitor.id) })}><X size={16} /></button>
                      </div>)}
                    </div>
                    {draft.competitors.length < 8 && <button className="ob-add" type="button" onClick={() => update({ competitors: [...draft.competitors, { id: crypto.randomUUID(), name: "" }] })}><Plus size={15} /> Add competitor</button>}
                  </fieldset>
                  <div className="ob-form-actions"><button className="ob-text-button" type="button" onClick={() => navigate(0)}><ArrowLeft size={14} /> Website</button><button className="ob-button ob-primary" type="submit">Continue to buyer questions <ArrowRight size={16} /></button></div>
                </form>
              ) : (
                <>
                  <div className="ob-panel-title"><span className="ob-icon"><Sparkles size={21} /></span><div><h2>What would your buyers ask?</h2><p>Select up to 8 questions to track. Edit any wording.</p></div></div>
                  {draft.receipt?.domain === draft.domain && <p className="ob-suggestion-note">AI-generated suggestions based on web research. Review for relevance; these are not measured search volumes.</p>}
                  <fieldset disabled={!!busy} className="ob-fields">
                    <div className="ob-question-count"><span>BUYER QUESTIONS</span><strong>{selectedCount} of 8 selected</strong></div>
                    <div className="ob-questions">
                      {draft.questions.map((question, i) => <div className={`ob-question ${question.selected ? "is-selected" : ""}`} key={question.id}>
                        <input className="ob-check" type="checkbox" checked={question.selected} aria-label={`Track buyer question ${i + 1}`} disabled={!question.selected && selectedCount >= 8}
                          onChange={(event) => update({ questions: draft.questions.map((q) => q.id === question.id ? { ...q, selected: event.target.checked } : q) })} />
                        <div className="ob-question-content"><label htmlFor={`${id}-question-${question.id}`}>Buyer question {i + 1}</label><textarea id={`${id}-question-${question.id}`} value={question.text} maxLength={500} rows={2} placeholder="What would a customer ask before choosing a product like yours?"
                          onChange={(event) => update({ questions: draft.questions.map((q) => q.id === question.id ? { ...q, text: event.target.value } : q) })} /></div>
                        <button className="ob-remove" type="button" aria-label={`Remove buyer question ${i + 1}`} onClick={() => update({ questions: draft.questions.filter((q) => q.id !== question.id) })}><X size={16} /></button>
                      </div>)}
                    </div>
                    {draft.questions.length < 16 && <button className="ob-add" type="button" onClick={() => update({ questions: [...draft.questions, { id: crypto.randomUUID(), text: "", selected: selectedCount < 8 }] })}><Plus size={15} /> Add buyer question</button>}
                  </fieldset>
                  <div className="ob-ready-note"><CheckCircle2 size={17} /><div><strong>Your workspace starts here.</strong><p>Save these choices, then review engines and pricing for your first audit. Saving does not spend credits or enable a schedule.</p></div></div>
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

            {draft.receipt && <ResearchReceipt receipt={draft.receipt} />}
            <p className="ob-draft-note">{storageWarning ? "Browser storage is unavailable. Keep this tab open until your setup is saved." : "Your setup draft stays in this browser until you save your workspace."}</p>
          </div>
        </div>
      </main>
      <footer className="ob-footer"><span>Treg Lens / Brand setup</span><span>Made for your next move.</span></footer>
    </div>
  );
}

function ResearchReceipt({ receipt }: { receipt: Research }) {
  return (
    <details className="ob-receipt" open={receipt.errors.length ? true : undefined}>
      <summary><span><CheckCircle2 size={15} /> Research {receipt.errors.length ? "needs your review" : "received"}</span><span>{receipt.costKnown && receipt.totalCostUsd !== null ? money(receipt.totalCostUsd) : "Charge unknown"} <ChevronDown size={14} /></span></summary>
      <div className="ob-receipt-body">
        <p>Website researched: <strong>{receipt.domain || receipt.url}</strong></p>
        {receipt.errors.map((issue, i) => <p className="ob-receipt-error" key={i}>{issue.error}</p>)}
        {!receipt.costKnown && <p>The provider didn’t confirm the full charge. Known charges: {money(receipt.knownCostUsd)}. Check Treg activity before repeating research.</p>}
        <p>Suggestions can be incomplete or inaccurate. Check your brand, competitors, and questions before saving.</p>
        {receipt.sources.length > 0 && <><strong>Research sources</strong><ul>{receipt.sources.map((source, i) => <li key={`${source.url}-${i}`}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title || new URL(source.url).hostname}<ArrowUpRight size={13} /></a></li>)}</ul></>}
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
