"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  ExternalLink,
  Globe2,
  KeyRound,
  Settings2,
  ShieldCheck,
  X,
} from "lucide-react";
import { DialogFrame, type ProjectSettings } from "./audit-dialog";
import { safeEvidenceUrl } from "@/lib/workspace-profile";
import { QUESTION_INTENT_LABELS } from "@/lib/onboarding-review";
import "./dialog.css";

type SettingsDialogProps = {
  open: boolean;
  onClose: () => void;
  project: ProjectSettings;
  onSave: (project: ProjectSettings, token: string) => void;
  token?: string;
};

export function SettingsDialog({
  open,
  onClose,
  project,
  onSave,
  token = "",
}: SettingsDialogProps) {
  const id = useId();
  const [brand, setBrand] = useState(project.brand);
  const [domain, setDomain] = useState(project.domain);
  const [description, setDescription] = useState(project.description ?? "");
  const [audience, setAudience] = useState(project.audience ?? "");
  const [competitors, setCompetitors] = useState(
    project.competitors.join(", "),
  );
  const [apiToken, setApiToken] = useState(token);
  const [serverConfigured, setServerConfigured] = useState<boolean | null>(
    null,
  );
  const wasOpen = useRef(false);
  const competitorList = competitors
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter(Boolean);

  useEffect(() => {
    if (open && !wasOpen.current) {
      setBrand(project.brand);
      setDomain(project.domain);
      setDescription(project.description ?? "");
      setAudience(project.audience ?? "");
      setCompetitors(project.competitors.join(", "));
      setApiToken(token);
    }
    wasOpen.current = open;
  }, [open, project, token]);

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

  return (
    <DialogFrame
      open={open}
      onClose={onClose}
      titleId={`${id}-title`}
      descriptionId={`${id}-description`}
      className="lens-settings-dialog"
    >
      <div className="lens-dialog-heading">
        <div className="lens-dialog-eyebrow">
          <span className="lens-eyebrow-dot" /> MAKE IT YOURS
        </div>
        <button
          className="lens-dialog-close"
          type="button"
          aria-label="Close settings"
          onClick={onClose}
        >
          <X size={19} />
        </button>
        <div className="lens-dialog-title-row">
          <div className="lens-dialog-icon">
            <Settings2 size={23} strokeWidth={1.6} />
          </div>
          <h2 id={`${id}-title`}>Your workspace.</h2>
        </div>
        <p id={`${id}-description`}>
          A little context. A much clearer picture.
        </p>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (brand.trim() && domain.trim() && competitorList.length <= 8) {
            onSave(
              {
                brand: brand.trim(),
                domain: domain.trim(),
                competitors: competitorList,
                ...(project.description !== undefined || description.trim() ? { description: description.trim() } : {}),
                ...(project.audience !== undefined || audience.trim() ? { audience: audience.trim() } : {}),
                market: { country: "US", language: "en" },
              },
              apiToken.trim(),
            );
            onClose();
          }
        }}
      >
        <div className="lens-dialog-body">
          <div className="lens-field-section-label">
            <span>01</span> BRAND PROFILE
          </div>
          <div className="lens-dialog-grid">
            <label className="lens-dialog-field" htmlFor={`${id}-brand`}>
              Brand name
              <input
                id={`${id}-brand`}
                data-initial-focus
                value={brand}
                onChange={(event) => setBrand(event.target.value)}
                maxLength={100}
                placeholder="Treg"
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
                  maxLength={200}
                  placeholder="treg.to"
                  required
                />
              </div>
            </label>
          </div>
          <label className="lens-dialog-field" htmlFor={`${id}-description-field`}>
            Business description
            <textarea
              id={`${id}-description-field`}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={1200}
              rows={3}
              placeholder="What you offer and who you help."
            />
          </label>
          <label className="lens-dialog-field" htmlFor={id + "-audience"}>
            Who are your buyers?
            <textarea id={id + "-audience"} aria-label="Who are your buyers?" value={audience} onChange={(event) => setAudience(event.target.value)} maxLength={600} rows={2} placeholder="The people, businesses and markets you serve." />
          </label>
          <div className="lens-audit-scope" aria-label="Measurement coverage"><strong>United States / English</strong><p>This is the market currently measured by the answer engines. Your buyer description can describe a different audience, but does not change collection coverage.</p></div>
          <label className="lens-dialog-field" htmlFor={`${id}-competitors`}>
            Competitors
            <textarea
              id={`${id}-competitors`}
              value={competitors}
              onChange={(event) => setCompetitors(event.target.value)}
              rows={2}
              placeholder="Exa, Firecrawl, Tavily"
              aria-describedby={`${id}-competitor-help`}
            />
            <span className="lens-field-help" id={`${id}-competitor-help`}>
              Separate up to 8 brands with commas. These brands appear in your
              comparisons.
            </span>
          </label>
          {competitorList.length > 8 && (
            <p role="alert" className="lens-inline-error">
              Keep your comparison focused on up to 8 competitors.
            </p>
          )}
          {!!project.competitorDetails?.length && <details className="lens-profile-details"><summary>Competitor websites and research evidence</summary><ul>{project.competitorDetails.map((item) => <li key={item.name}><strong>{item.name}</strong>{item.domain && <span>{item.domain}</span>}{item.reason && <p>{item.reason}</p>}{item.sourceUrl && safeEvidenceUrl(item.sourceUrl) ? <a href={safeEvidenceUrl(item.sourceUrl)!} target="_blank" rel="noopener noreferrer">Cited competitor source <ArrowUpRight size={12} /></a> : <small>Suggested competitor · verify relevance</small>}</li>)}</ul></details>}
          {!!project.buyerQuestions?.length && <details className="lens-profile-details"><summary>Saved buyer-question ideas</summary><p>Reviewed ideas remain here, including ones you left out of the first check. Manage the questions you track in Prompt tracking.</p><ul>{project.buyerQuestions.map((question) => <li key={question.text}><strong>{question.text}</strong><span>{QUESTION_INTENT_LABELS[question.intent]} · {question.provenance === "generated" ? "AI suggestion" : question.provenance === "discovered" ? "Observed discovery" : "Added or edited by you"}</span>{question.reason && <p>{question.reason}</p>}</li>)}</ul></details>}

          <div className="lens-field-section-label">
            <span>02</span> CONNECTED INTELLIGENCE
          </div>
          <div className="lens-connection-card">
            <span className="lens-treg-mini">
              t<span>reg</span>
              <i />
            </span>
            <div>
              <strong>Treg AEO toolkit</strong>
              <span>Live answers. Real citations. One API.</span>
            </div>
            <span
              className={`lens-connection-status ${serverConfigured || token ? "is-connected" : ""}`}
            >
              <span />
              {serverConfigured || token ? "Connected" : "API access"}
            </span>
          </div>
          <label
            className="lens-dialog-field lens-token-field"
            htmlFor={`${id}-token`}
          >
            <span>
              <KeyRound size={13} /> API token{" "}
              <span className="lens-field-optional">
                {serverConfigured ? "optional" : "session only"}
              </span>
            </span>
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
          <div className="lens-privacy-note">
            <ShieldCheck size={16} strokeWidth={1.6} />
            <p>
              Your optional override stays in memory for this page session. It
              is never saved to browser storage or included in exports.
              {serverConfigured
                ? " Your signed-in Treg key is already connected."
                : ""}
            </p>
          </div>
          <a
            className="lens-docs-link"
            href="https://treg.to/aeo"
            target="_blank"
            rel="noreferrer"
          >
            <span>
              Explore the Treg AEO toolkit <ExternalLink size={12} />
            </span>
            <ArrowUpRight size={16} />
          </a>
        </div>
        <div className="lens-dialog-footer lens-settings-footer">
          <span className="lens-settings-save-note">
            Changes synchronize to your private server workspace.
          </span>
          <button
            className="lens-dialog-primary"
            type="submit"
            disabled={
              !brand.trim() || !domain.trim() || competitorList.length > 8
            }
          >
            Save changes <Check size={16} />
          </button>
        </div>
      </form>
    </DialogFrame>
  );
}

export default SettingsDialog;
