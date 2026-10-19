"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  Check,
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
import "./discovery-dialog.css";

type DiscoveryDialogProps = {
  open: boolean;
  onClose: () => void;
  onAdd: (prompts: string[]) => void;
  token?: string;
  brand: string;
};
const money = (amount: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 5,
  }).format(amount);

export function DiscoveryDialog({
  open,
  onClose,
  onAdd,
  token = "",
  brand,
}: DiscoveryDialogProps) {
  const id = useId();
  const [seeds, setSeeds] = useState([
    "AI agent tools",
    "AI search visibility",
  ]);
  const [apiToken, setApiToken] = useState(token);
  const [serverConfigured, setServerConfigured] = useState<boolean | null>(
    null,
  );
  const [quoteState, setQuoteState] = useState<{
    request: string;
    estimate: DiscoveryEstimate | null;
    error: string;
  } | null>(null);
  const [running, setRunning] = useState(false);
  const runningRef = useRef(false);
  const [result, setResult] = useState<DiscoveryResult | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<"question" | "keyword">(
    "question",
  );
  const wasOpen = useRef(false);
  const cleanSeeds = useMemo(
    () => seeds.map((seed) => seed.trim()).filter(Boolean),
    [seeds],
  );
  const validSeeds =
    cleanSeeds.length >= 2 &&
    cleanSeeds.length <= 3 &&
    cleanSeeds.every((seed) => seed.length >= 2 && seed.length <= 100) &&
    new Set(cleanSeeds.map((seed) => seed.toLowerCase())).size ===
      cleanSeeds.length;
  const quoteRequest = useMemo(
    () => JSON.stringify({ seeds: cleanSeeds, brand, estimateOnly: true }),
    [cleanSeeds, brand],
  );
  const estimate =
    quoteState?.request === quoteRequest ? quoteState.estimate : null;
  const quoteError =
    quoteState?.request === quoteRequest ? quoteState.error : "";
  const loadingQuote =
    open &&
    validSeeds &&
    !result &&
    !running &&
    quoteState?.request !== quoteRequest;

  useEffect(() => {
    if (open && !wasOpen.current && !runningRef.current) setApiToken(token);
    wasOpen.current = open;
  }, [open, token]);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    fetch("/api/aeo/status", { signal: controller.signal })
      .then((response) => response.json())
      .then((data) => setServerConfigured(data.configured === true))
      .catch(() => {
        if (!controller.signal.aborted) setServerConfigured(false);
      });
    return () => controller.abort();
  }, [open]);
  useEffect(() => {
    if (!open || !validSeeds || running || result) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/aeo/discover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: quoteRequest,
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Could not load discovery pricing.");
        if (!controller.signal.aborted)
          setQuoteState({ request: quoteRequest, estimate: data, error: "" });
      } catch (error) {
        if (!controller.signal.aborted)
          setQuoteState({
            request: quoteRequest,
            estimate: null,
            error:
              error instanceof Error
                ? error.message
                : "Could not load discovery pricing.",
          });
      }
    }, 450);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, validSeeds, running, result, quoteRequest]);

  async function discover() {
    if (!validSeeds || !estimate || runningRef.current) return;
    setError("");
    setRunning(true);
    runningRef.current = true;
    try {
      const response = await fetch("/api/aeo/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seeds: cleanSeeds,
          brand,
          ...(apiToken.trim() ? { token: apiToken.trim() } : {}),
        }),
      });
      const data: DiscoveryResult & { error?: string } = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Discovery could not finish.");
      setResult(data);
      const questions = data.candidates.filter(
        (candidate) => candidate.kind === "question",
      );
      setActiveTab(questions.length ? "question" : "keyword");
      setSelected(questions.slice(0, 3).map((candidate) => candidate.id));
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Discovery could not finish. Check Treg activity before retrying.",
      );
    } finally {
      setRunning(false);
      runningRef.current = false;
    }
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
  const selectedCandidates =
    result?.candidates.filter((candidate) => selected.includes(candidate.id)) ??
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
              Choose up to 8 prompts for {brand || "your brand"}. Questions come
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
              onClick={() => {
                setResult(null);
                setSelected([]);
                setError("");
              }}
            >
              <Search size={13} /> Try different seeds
            </button>
            <span className="lens-discovery-selected-count">
              {selected.length} / 8 selected
            </span>
            <button
              className="lens-dialog-primary"
              type="button"
              disabled={selected.length === 0}
              onClick={() => {
                onAdd(selectedCandidates.map((candidate) => candidate.text));
                setResult(null);
                setSelected([]);
                onClose();
              }}
            >
              Add {selected.length || "selected"}{" "}
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
            <fieldset className="lens-dialog-fieldset" disabled={running}>
              <div className="lens-field-section-label">
                <span>01</span> PLANT A FEW SEEDS
              </div>
              <p className="lens-discovery-seed-description">
                Add 2–3 terms your customers use to describe your category.
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
                            ? "AI agent tools"
                            : index === 1
                              ? "AI search visibility"
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
                          ? "Using server credentials"
                          : "Enter your Treg API token"
                      }
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </label>
                  <p className="lens-field-help">
                    {serverConfigured
                      ? "Your server is connected. Add a token to use another account."
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
