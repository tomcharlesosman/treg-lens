"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  Check,
  Download,
  History,
  ChevronDown,
  CircleHelp,
  Compass,
  ExternalLink,
  Globe2,
  KeyRound,
  Layers3,
  LoaderCircle,
  MessageCircle,
  Plus,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { DialogFrame } from "./audit-dialog";
import type {
  DiscoveryCandidate,
  DiscoveryEstimate,
  DiscoveryResult,
} from "@/lib/discovery";
import { createSavedDiscovery, parseSavedDiscovery, suggestedDiscoverySeeds, type SavedDiscovery } from "@/lib/discovery-research";
import { normalizeDomain, type Project } from "@/lib/workspace-data";
import "./discovery-dialog.css";

type DiscoveryDialogProps = {
  open: boolean;
  onClose: () => void;
  onAdd: (receipt: SavedDiscovery, selectedIds: string[]) => Promise<boolean>;
  onSave: (receipt: SavedDiscovery) => Promise<boolean>;
  token?: string;
  project: Project;
  storageKey: string;
  savedResearch: SavedDiscovery[];
  initialReceiptId?: string;
  onRunningChange?: (running: boolean) => void;
};
type Recovery = { pending: boolean; startedAt: string; input: SavedDiscovery["input"]; estimate: DiscoveryEstimate; receipt?: SavedDiscovery };
const money = (amount: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 5,
  }).format(amount);

export function DiscoveryDialog({
  open, onClose, onAdd, onSave, token = "", project, storageKey, savedResearch, initialReceiptId, onRunningChange,
}: DiscoveryDialogProps) {
  const brand = project.brand;
  const id = useId();
  const [initialReceipt] = useState(() => savedResearch.find((item) => item.id === initialReceiptId && item.input.brand.trim().toLowerCase() === project.brand.trim().toLowerCase() && normalizeDomain(item.input.domain) === normalizeDomain(project.domain)) ?? null);
  const [seeds, setSeeds] = useState(() => initialReceipt?.input.seeds ?? suggestedDiscoverySeeds(project));
  const [apiToken, setApiToken] = useState(token);
  const [serverConfigured, setServerConfigured] = useState<boolean | null>(null);
  const [quoteState, setQuoteState] = useState<{ request: string; estimate: DiscoveryEstimate | null; error: string } | null>(null);
  const [running, setRunning] = useState(false);
  const runningRef = useRef(false);
  const [result, setResult] = useState<DiscoveryResult | null>(initialReceipt?.result ?? null);
  const [receipt, setReceipt] = useState<SavedDiscovery | null>(initialReceipt);
  const [saveState, setSaveState] = useState<"saving" | "saved" | "error" | null>(initialReceipt ? "saved" : null);
  const [importing, setImporting] = useState(false);
  const [interrupted, setInterrupted] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string[]>(initialReceipt?.selectedCandidateIds ?? []);
  const [activeTab, setActiveTab] = useState<"question" | "keyword">(initialReceipt?.result.questionCount === 0 ? "keyword" : "question");
  const wasOpen = useRef(false);
  const loadedKey = useRef("");
  const seedContext = useRef("");
  const projectContext = JSON.stringify([project.brand, project.domain, project.description, project.audience, project.buyerQuestions]);
  const recoveryKey = `${storageKey}:discovery:v1`;
  const cleanSeeds = useMemo(() => seeds.map((seed) => seed.trim()).filter(Boolean), [seeds]);
  const validSeeds = cleanSeeds.length >= 2 && cleanSeeds.length <= 3 && cleanSeeds.every((seed) => seed.length >= 2 && seed.length <= 100) && new Set(cleanSeeds.map((seed) => seed.toLowerCase())).size === cleanSeeds.length;
  const quoteRequest = useMemo(() => JSON.stringify({ seeds: cleanSeeds, brand, estimateOnly: true }), [cleanSeeds, brand]);
  const estimate = quoteState?.request === quoteRequest ? quoteState.estimate : null;
  const quoteError = quoteState?.request === quoteRequest ? quoteState.error : "";
  const loadingQuote = open && validSeeds && !result && !running && !interrupted && quoteState?.request !== quoteRequest;

  function persistRecovery(value: Recovery) {
    try {
      const raw = JSON.stringify(value);
      localStorage.setItem(recoveryKey, raw);
      return localStorage.getItem(recoveryKey) === raw;
    } catch { return false; }
  }
  function clearRecovery(reviewedOrNotSubmitted = false) {
    try {
      // A viewed/imported historical receipt is unrelated to an interrupted
      // submission. Only explicit activity review (or a pre-submission refusal)
      // can clear a pending marker; acknowledged returned receipts use pending:false.
      if (!reviewedOrNotSubmitted && JSON.parse(localStorage.getItem(recoveryKey) || "null")?.pending === true) return;
      localStorage.removeItem(recoveryKey);
    } catch { /* An acknowledged server copy remains safe. */ }
  }
  function showReceipt(saved: SavedDiscovery, previouslySaved = true) {
    setReceipt(saved);
    setResult(saved.result);
    setSeeds(saved.input.seeds);
    const questions = saved.result.candidates.filter((candidate) => candidate.kind === "question");
    setActiveTab(questions.length ? "question" : "keyword");
    setSelected(saved.selectedCandidateIds.length ? saved.selectedCandidateIds : questions.slice(0, 3).map((candidate) => candidate.id));
    setSaveState(previouslySaved ? "saved" : "error");
    setError("");
  }
  async function saveReceipt(saved: SavedDiscovery) {
    setSaveState("saving");
    try {
      if (await onSave(saved)) {
        setSaveState("saved");
        clearRecovery();
        setError("");
        return true;
      }
    } catch { /* Keep the original paid receipt recoverable. */ }
    setSaveState("error");
    setError("Research returned, but its server save was not acknowledged. Keep this result, retry saving, or download it before leaving. No research will be repeated.");
    return false;
  }
  function downloadRecovery() {
    const recovery = receipt ?? (() => { try { return JSON.parse(localStorage.getItem(recoveryKey) || "null"); } catch { return null; } })();
    if (!recovery) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(recovery, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `treg-lens-discovery-${receipt?.id ?? "interrupted"}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  useEffect(() => {
    if (open && !wasOpen.current && !runningRef.current) setApiToken(token);
    wasOpen.current = open;
    if (!open || !storageKey) return;
    const restoring = loadedKey.current !== recoveryKey;
    if (!restoring && (seedContext.current === projectContext || result || interrupted || runningRef.current)) return;
    const timer = window.setTimeout(() => {
    seedContext.current = projectContext;
    if (!initialReceipt) setSeeds(suggestedDiscoverySeeds(project));
    if (!restoring) return;
    loadedKey.current = recoveryKey;
    try {
      const raw = JSON.parse(localStorage.getItem(recoveryKey) || "null") as Recovery | null;
      const recovered = parseSavedDiscovery(raw?.receipt);
      setInterrupted(raw?.pending === true);
      if (initialReceipt) return;
      if (recovered) {
        setReceipt(recovered); setResult(recovered.result); setSeeds(recovered.input.seeds);
        setActiveTab(recovered.result.questionCount ? "question" : "keyword");
        setSelected(recovered.selectedCandidateIds.length ? recovered.selectedCandidateIds : recovered.result.candidates.filter((c) => c.kind === "question").slice(0, 3).map((c) => c.id));
        setSaveState("error"); setError("Recovered returned research. Save this result without making another paid call.");
      } else if (raw?.pending === true) {
        setInterrupted(true);
        setError("A discovery was interrupted before a result was acknowledged. Check Treg activity before deliberately starting again. It will not be repeated automatically.");
      }
    } catch { /* Invalid recovery data cannot authorize research. */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, token, storageKey, recoveryKey, project, projectContext, result, interrupted, initialReceipt]);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    fetch("/api/aeo/status", { signal: controller.signal }).then((response) => response.json()).then((data) => setServerConfigured(data.configured === true)).catch(() => { if (!controller.signal.aborted) setServerConfigured(false); });
    return () => controller.abort();
  }, [open]);
  useEffect(() => {
    if (!open || !validSeeds || running || result || interrupted) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/aeo/discover", { method: "POST", headers: { "Content-Type": "application/json" }, body: quoteRequest, signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load discovery pricing.");
        if (!controller.signal.aborted) setQuoteState({ request: quoteRequest, estimate: data, error: "" });
      } catch (error) {
        if (!controller.signal.aborted) setQuoteState({ request: quoteRequest, estimate: null, error: error instanceof Error ? error.message : "Could not load discovery pricing." });
      }
    }, 450);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [open, validSeeds, running, result, interrupted, quoteRequest]);

  async function discover() {
    if (!validSeeds || !estimate || runningRef.current || interrupted) return;
    try {
      if (JSON.parse(localStorage.getItem(recoveryKey) || "null")?.pending === true) {
        setInterrupted(true);
        setError("Review the interrupted discovery in Treg activity before starting new paid research.");
        return;
      }
    } catch { /* The recovery write below still has to succeed before submission. */ }
    const originalInput = { brand, domain: project.domain, seeds: [...cleanSeeds] };
    const pending: Recovery = { pending: true, startedAt: new Date().toISOString(), input: originalInput, estimate };
    if (!persistRecovery(pending)) {
      setError("Browser recovery storage is unavailable. Enable storage before paid discovery so an interrupted request cannot be repeated accidentally.");
      return;
    }
    setError(""); setRunning(true); runningRef.current = true; onRunningChange?.(true);
    try {
      const response = await fetch("/api/aeo/discover", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...originalInput, maxCostUsd: estimate.totalCostUsd, ...(apiToken.trim() ? { token: apiToken.trim() } : {}) }),
      });
      const data: DiscoveryResult & { error?: string; savedReceipt?: SavedDiscovery } = await response.json();
      if (!response.ok) {
        if ([400, 401, 403, 409, 429].includes(response.status)) clearRecovery(true);
        else setInterrupted(true);
        if (response.status === 409) setQuoteState(null);
        throw new Error(data.error || "Discovery could not finish. Check Treg activity before another request.");
      }
      const saved = parseSavedDiscovery(data.savedReceipt) ?? createSavedDiscovery(originalInput, originalInput.seeds, data.acceptedEstimate ?? estimate, data);
      setReceipt(saved); setResult(saved.result);
      const questions = saved.result.candidates.filter((candidate) => candidate.kind === "question");
      setActiveTab(questions.length ? "question" : "keyword");
      setSelected(questions.slice(0, 3).map((candidate) => candidate.id));
      // The server normally already appended this receipt. Keep an independent
      // credential-free browser copy until its workspace acknowledgement arrives.
      persistRecovery({ ...pending, pending: false, receipt: saved });
      await saveReceipt(saved);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Discovery could not finish. Check Treg activity before retrying.");
      try { if (JSON.parse(localStorage.getItem(recoveryKey) || "null")?.pending === true) setInterrupted(true); } catch { setInterrupted(true); }
    } finally { setRunning(false); runningRef.current = false; onRunningChange?.(false); }
  }
  async function importSelected() {
    if (!receipt || !selected.length || importing) return;
    setImporting(true); setError("");
    try {
      if (await onAdd(receipt, selected)) {
        clearRecovery(); setResult(null); setReceipt(null); setSelected([]); setSaveState(null); onClose();
      } else setError("The import was not acknowledged. Your original research is retained. Resolve the workspace save before trying to import again.");
    } catch { setError("The import could not be saved. Your original research is retained; no paid request was repeated."); }
    finally { setImporting(false); }
  }
  function toggle(candidate: DiscoveryCandidate) {
    setSelected((previous) =>
      previous.includes(candidate.id)
        ? previous.filter((candidateId) => candidateId !== candidate.id)
        : previous.length < 8
          ? [...previous, candidate.id]
          : previous,
    );
  }
  const visibleCandidates =
    result?.candidates.filter((candidate) => candidate.kind === activeTab) ??
    [];

  return (
    <DialogFrame
      open={open}
      onClose={onClose}
      titleId={`${id}-title`}
      descriptionId={`${id}-description`}
      className="lens-discovery-dialog"
    >
      <div className="lens-dialog-heading">
        <div className="lens-dialog-eyebrow">
          <span className="lens-eyebrow-dot" /> FOLLOW THE CURIOSITY
        </div>
        <button
          className="lens-dialog-close"
          type="button"
          aria-label="Close prompt discovery"
          onClick={onClose}
        >
          <X size={19} />
        </button>
        <div className="lens-dialog-title-row">
          <div className="lens-dialog-icon">
            <Compass size={23} strokeWidth={1.6} />
          </div>
          <h2 id={`${id}-title`}>Find your next question.</h2>
        </div>
        <p id={`${id}-description`}>
          Start with a category. Discover what people are already asking.
        </p>
      </div>
      {savedResearch.length > 0 && (
        <details className="lens-discovery-history">
          <summary><History size={14} /> Saved research <span>{savedResearch.length}</span></summary>
          <p>Reopen original evidence without buying it again. Latest 20 receipts are retained in full workspace backups.</p>
          {[...savedResearch].reverse().map((saved) => (
            <button type="button" key={saved.id} disabled={running || importing || saveState === "saving" || (Boolean(receipt) && saveState === "error")} onClick={() => showReceipt(saved)}>
              <span><strong>{saved.input.seeds.join(" · ")}</strong><small>{saved.input.brand} · {new Date(saved.result.completedAt).toLocaleString("en-US")} · {saved.result.candidates.length} candidates</small></span><ArrowRight size={13} />
            </button>
          ))}
        </details>
      )}
      {result ? (
        <>
          <div className="lens-discovery-result-intro">
            <div className="lens-discovery-result-metrics">
              <span>
                <strong>{result.questionCount}</strong> real questions
              </span>
              <span>
                <strong>{result.keywordCount}</strong> keyword ideas
              </span>
              <span className="lens-discovery-settled">
                {result.totalCostKnown
                  ? `${money(result.totalCostUsd)} charged`
                  : result.totalCostUsd > 0
                    ? `${money(result.totalCostUsd)}+ · billing incomplete`
                    : "Billing not fully returned"}
              </span>
            </div>
            <p>
              Choose up to 8 prompts for {receipt?.input.brand || "your brand"}. Questions come
              directly from Google’s People Also Ask; keyword ideas keep their
              original phrasing.
            </p>
            {result.questionCount === 0 && (
              <div className="lens-discovery-empty-questions">
                <CircleHelp size={15} />
                <span>
                  Google returned no People Also Ask questions for these
                  searches. You can still add the real keyword ideas below as
                  prompts.
                </span>
              </div>
            )}
            {result.errors.length > 0 && (
              <details className="lens-discovery-errors">
                <summary>
                  {result.errors.length}{" "}
                  {result.errors.length === 1 ? "lookup did" : "lookups did"}{" "}
                  not finish <ChevronDown size={12} />
                </summary>
                {result.errors.map((item, index) => (
                  <p key={`${item.seed}-${index}`}>
                    <strong>{item.seed}:</strong> {item.error}
                  </p>
                ))}
              </details>
            )}
            {result.reservedCostUsd > 0 && (
              <p className="lens-discovery-reserved">
                An additional {money(result.reservedCostUsd)} is reserved for a
                pending request. Check Treg activity before retrying.
              </p>
            )}
            {!result.totalCostKnown && (
              <p className="lens-discovery-reserved">
                Some final charges were not returned. Check your Treg activity
                for the complete settled cost.
              </p>
            )}
          </div>
          <div className="lens-discovery-save-status" role="status" aria-live="polite">
            <span>{saveState === "saved" ? "Original research saved to your workspace." : saveState === "saving" ? "Saving original research…" : "Original research needs a server save."}</span>
            {saveState === "error" && receipt && <button type="button" onClick={() => void saveReceipt(receipt)}>Retry saving research</button>}
            <button type="button" onClick={downloadRecovery}><Download size={12} /> Download research</button>
          </div>
          {error && <div role="alert" className="lens-dialog-notice lens-dialog-notice-error lens-discovery-save-error">{error}</div>}
          {result.callIds.length > 0 && <details className="lens-discovery-call-ids"><summary>Treg call IDs</summary>{result.callIds.map((callId) => <code key={callId}>{callId}</code>)}</details>}
          <div className="lens-discovery-result-toolbar">
            <div role="tablist" aria-label="Discovered prompts">
              <button
                role="tab"
                id={`${id}-questions-tab`}
                aria-selected={activeTab === "question"}
                aria-controls={`${id}-questions-panel`}
                className={activeTab === "question" ? "is-active" : ""}
                type="button"
                onClick={() => setActiveTab("question")}
              >
                <MessageCircle size={13} /> Questions{" "}
                <span>{result.questionCount}</span>
              </button>
              <button
                role="tab"
                id={`${id}-keywords-tab`}
                aria-selected={activeTab === "keyword"}
                aria-controls={`${id}-keywords-panel`}
                className={activeTab === "keyword" ? "is-active" : ""}
                type="button"
                onClick={() => setActiveTab("keyword")}
              >
                <Layers3 size={13} /> Keywords{" "}
                <span>{result.keywordCount}</span>
              </button>
            </div>
            <button
              className="lens-discovery-select"
              type="button"
              onClick={() =>
                setSelected(
                  visibleCandidates
                    .slice(0, 8)
                    .map((candidate) => candidate.id),
                )
              }
              disabled={!visibleCandidates.length}
            >
              Select top {Math.min(8, visibleCandidates.length)}
            </button>
          </div>
          <div
            className="lens-discovery-candidates"
            role="tabpanel"
            id={`${id}-${activeTab === "question" ? "questions" : "keywords"}-panel`}
            aria-labelledby={`${id}-${activeTab === "question" ? "questions" : "keywords"}-tab`}
          >
            {visibleCandidates.length ? (
              visibleCandidates.map((candidate) => (
                <label
                  className={`lens-discovery-candidate ${selected.includes(candidate.id) ? "is-selected" : ""}`}
                  key={candidate.id}
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(candidate.id)}
                    onChange={() => toggle(candidate)}
                    disabled={
                      !selected.includes(candidate.id) && selected.length >= 8
                    }
                  />
                  <span className="lens-discovery-checkbox" aria-hidden="true">
                    {selected.includes(candidate.id) && (
                      <Check size={11} strokeWidth={2.7} />
                    )}
                  </span>
                  <span className="lens-discovery-candidate-content">
                    <strong>{candidate.text}</strong>
                    <span>
                      <i
                        className={
                          candidate.kind === "question" ? "is-question" : ""
                        }
                      >
                        {candidate.origin}
                      </i>
                      <small title={candidate.keyword}>
                        {candidate.kind === "question"
                          ? candidate.keyword
                          : candidate.seed}
                      </small>
                    </span>
                  </span>
                  {candidate.kind === "keyword" && (
                    <span className="lens-discovery-volume">
                      <strong>
                        {candidate.searchVolume === null
                          ? "—"
                          : candidate.searchVolume.toLocaleString("en-US")}
                      </strong>
                      <small>monthly searches</small>
                    </span>
                  )}
                </label>
              ))
            ) : (
              <div className="lens-discovery-no-results">
                <Search size={26} strokeWidth={1.3} />
                <strong>
                  No {activeTab === "question" ? "questions" : "keyword ideas"}{" "}
                  returned.
                </strong>
                <p>
                  {activeTab === "question"
                    ? "Explore keyword ideas or try more specific seed keywords."
                    : "Try broader seed keywords in another discovery."}
                </p>
              </div>
            )}
          </div>
          <div className="lens-dialog-footer lens-discovery-result-footer">
            <button
              className="lens-discovery-back"
              type="button"
              disabled={saveState !== "saved" || importing}
              onClick={() => { setResult(null); setReceipt(null); setSelected([]); setError(""); setSaveState(null); }}
            >
              <Search size={13} /> Try different seeds
            </button>
            <span className="lens-discovery-selected-count">
              {selected.length} / 8 selected
            </span>
            <button
              className="lens-dialog-primary"
              type="button"
              disabled={selected.length === 0 || saveState !== "saved" || importing}
              onClick={() => void importSelected()}
            >
              {importing ? "Saving" : "Add"} {selected.length || "selected"}{" "}
              {selected.length === 1 ? "prompt" : "prompts"} <Plus size={15} />
            </button>
            <p className="lens-cost-note">
              Search volumes belong to keywords, never to People Also Ask
              questions. — means the provider did not return a volume.
            </p>
          </div>
        </>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void discover();
          }}
        >
          <div className="lens-dialog-body">
            {interrupted && (
              <div className="lens-discovery-interrupted">
                <strong>Review interrupted research</strong>
                <p>Any returned server evidence appears in Saved research. Review Treg activity for pending or settled calls before approving fresh research.</p>
                <button type="button" onClick={downloadRecovery}><Download size={12} /> Download recovery record</button>
                <button type="button" onClick={() => { clearRecovery(true); setInterrupted(false); setError(""); setQuoteState(null); }}>I checked Treg activity — start new research</button>
              </div>
            )}
            <fieldset className="lens-dialog-fieldset" disabled={running || interrupted}>
              <div className="lens-field-section-label">
                <span>01</span> PLANT A FEW SEEDS
              </div>
              <p className="lens-discovery-seed-description">
                {suggestedDiscoverySeeds(project).some(Boolean) ? "Starting points from your reviewed buyer questions and business context. Edit them to focus this research." : `Describe what ${brand || "your business"} sells and who buys it. Add 2–3 relevant terms; nothing runs until you approve.`}
              </p>
              <div className="lens-discovery-seeds">
                {seeds.map((seed, index) => (
                  <div className="lens-discovery-seed-row" key={index}>
                    <label
                      className="lens-dialog-field"
                      htmlFor={`${id}-seed-${index}`}
                    >
                      <span className="lens-discovery-seed-number">
                        0{index + 1}
                      </span>
                      <input
                        id={`${id}-seed-${index}`}
                        data-initial-focus={index === 0 ? true : undefined}
                        value={seed}
                        onChange={(event) =>
                          setSeeds((previous) =>
                            previous.map((item, itemIndex) =>
                              index === itemIndex ? event.target.value : item,
                            ),
                          )
                        }
                        placeholder={
                          index === 0
                            ? "Your product or service category"
                            : index === 1
                              ? "A buyer problem or use case"
                              : "Your next category"
                        }
                        maxLength={100}
                        minLength={2}
                        required={index < 2}
                        aria-label={`Seed keyword ${index + 1}`}
                      />
                    </label>
                    {index === 2 && (
                      <button
                        className="lens-discovery-remove-seed"
                        type="button"
                        aria-label="Remove third seed"
                        onClick={() =>
                          setSeeds((previous) => previous.slice(0, 2))
                        }
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {seeds.length < 3 && (
                <button
                  type="button"
                  className="lens-example-button lens-discovery-add-seed"
                  onClick={() => setSeeds((previous) => [...previous, ""])}
                >
                  <Plus size={12} /> Add a third seed
                </button>
              )}
              <div className="lens-discovery-locale">
                <Globe2 size={13} />
                <span>United States</span>
                <span className="lens-discovery-locale-separator">/</span>
                <span>English</span>
                <span className="lens-discovery-locale-caption">
                  Fixed locale for consistent results
                </span>
              </div>
              <div className="lens-field-section-label">
                <span>02</span> TRACE THE CONVERSATION
              </div>
              <div className="lens-discovery-pipeline">
                <div>
                  <span className="lens-discovery-step-icon">
                    <Sparkles size={17} strokeWidth={1.6} />
                  </span>
                  <span>
                    <strong>Find keyword ideas</strong>
                    <small>Live Google suggestions, up to 8 per seed.</small>
                  </span>
                  <span className="lens-discovery-step-tag">GOOGLE</span>
                </div>
                <span className="lens-discovery-step-connector">
                  <ArrowDown size={13} />
                </span>
                <div>
                  <span className="lens-discovery-step-icon">
                    <MessageCircle size={17} strokeWidth={1.6} />
                  </span>
                  <span>
                    <strong>Discover real questions</strong>
                    <small>People Also Ask for the top 3 keyword ideas.</small>
                  </span>
                  <span className="lens-discovery-step-tag">PAA</span>
                </div>
                <span className="lens-discovery-step-connector">
                  <ArrowDown size={13} />
                </span>
                <div>
                  <span className="lens-discovery-step-icon">
                    <Check size={17} strokeWidth={1.6} />
                  </span>
                  <span>
                    <strong>Make them your prompts</strong>
                    <small>
                      Select the questions worth getting answers to.
                    </small>
                  </span>
                  <span className="lens-discovery-step-tag">YOUR PICK</span>
                </div>
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
                  <label className="lens-dialog-field" htmlFor={`${id}-token`}>
                    Treg API token
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
                      ? "Using your signed-in Treg key. Add a token to use another account."
                      : "Used only for this discovery and never saved to disk."}{" "}
                    <a
                      href="https://treg.to/aeo"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Treg toolkit <ExternalLink size={10} />
                    </a>
                  </p>
                </div>
              </details>
            </fieldset>
            {error && (
              <div
                role="alert"
                className="lens-dialog-notice lens-dialog-notice-error"
              >
                {error}
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
                  <strong>Following the questions…</strong>
                </div>
                <p>
                  Discovering keyword ideas and People Also Ask questions. You
                  can close this window and return to your results in this tab.
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
                ESTIMATED API COST <CircleHelp size={12} />
              </span>
              {loadingQuote ? (
                <span className="lens-estimate-value lens-estimate-loading">
                  Reading live prices…
                </span>
              ) : estimate ? (
                <span className="lens-estimate-value">
                  {money(estimate.totalCostUsd)}{" "}
                  <small>up to {estimate.maxCalls} requests</small>
                </span>
              ) : (
                <span className="lens-estimate-empty">
                  {quoteError || "Enter at least 2 different seeds"}
                </span>
              )}
            </div>
            <button
              className="lens-dialog-primary"
              type="submit"
              disabled={
                !validSeeds ||
                !estimate ||
                loadingQuote ||
                running ||
                interrupted ||
                (serverConfigured === false && !apiToken.trim())
              }
            >
              {running ? (
                <>
                  <LoaderCircle size={15} className="lens-spin" /> Discovering
                </>
              ) : (
                <>
                  Discover prompts <ArrowRight size={15} />
                </>
              )}
            </button>
            <p className="lens-cost-note">
              {estimate?.note ||
                "Nothing is charged until you click Discover prompts. Suggestions come from search data."}
            </p>
            {estimate && (
              <details className="lens-pricing-details">
                <summary>
                  View price breakdown <ChevronDown size={11} />
                </summary>
                <div>
                  {estimate.breakdown.map((item) => (
                    <span key={item.endpointId}>
                      <span>
                        {item.label} · up to {item.calls} ×{" "}
                        {money(item.costPerCallUsd)}
                      </span>
                      <strong>{money(item.subtotalUsd)}</strong>
                    </span>
                  ))}
                </div>
              </details>
            )}
          </div>
        </form>
      )}
    </DialogFrame>
  );
}

export default DiscoveryDialog;
