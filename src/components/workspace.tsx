"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GITHUB_REPOSITORY } from "@/lib/site";
import { useEffect, useMemo, useRef, useState, type ReactNode, type SetStateAction } from "react";
import {
  ArrowDownToLine,
  Clock,
  RefreshCw,
  Cloud,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ExternalLink,
  Eye,
  FileText,
  Code2,
  History,
  LayoutDashboard,
  Lightbulb,
  Link2,
  Menu,
  MessageSquareText,
  MoreHorizontal,
  LogOut,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  Users,
  X,
  Zap,
} from "lucide-react";
import AuditDialog from "./audit-dialog";
import AnswerBody from "./answer-body";
import DiscoveryDialog from "./discovery-dialog";
import { SourceDialog } from "./source-dialog";
import type { SourceResearch } from "@/lib/source-research";
import { useServerWorkspace, type AuditPersistence } from "./use-server-workspace";
import WorkspaceBackup, { downloadWorkspaceBackup } from "./workspace-backup";
import MonitorSettings from "./monitor-settings";
import "./workspace-live.css";
import SettingsDialog from "./settings-dialog";
import BrandOnboarding, { ResearchReceipt } from "./brand-onboarding";
import AuditFindings from "./audit-findings";
import VisibilityTrends from "./visibility-trends";
import PromptLibrary from "./prompt-library";
import CitationExplorer from "./citation-explorer";
import PagePlans from "./page-plans";
import EvidenceReports from "./evidence-reports";
import WorkspaceContinuity from "./workspace-continuity";
import { setStepDismissed, type ContinuityAction } from "@/lib/workspace-continuity";
import { buildPagePlanFollowup, pagePlanOpportunities, type PagePlan } from "@/lib/page-plans";
import type { EvidenceReport } from "@/lib/evidence-reports";
import { syncPromptRecords, activePromptTexts, type PromptRecord } from "@/lib/prompt-library";
import type { SavedDiscovery } from "@/lib/discovery-research";
import { isExampleProfile, needsBrandOnboarding, updateProjectProfile } from "@/lib/workspace-onboarding";
import type { WorkspaceSnapshot } from "@/lib/workspace-storage";
import type { AnswerResult } from "@/lib/aeo";
import {
  ENGINES,
  brandStats,
  createDemoRuns,
  downloadFile,
  mentionRate,
  normalizeDomain,
  resultsCsv,
  sourceStats,
  visibility,
  type Project,
  type SavedRun,
} from "@/lib/workspace-data";

type View =
  | "overview"
  | "prompts"
  | "competitors"
  | "citations"
  | "opportunities"
  | "history"
  | "reports"
  | "guide";
const NAV = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "prompts", label: "Prompt tracking", icon: MessageSquareText },
  { id: "competitors", label: "Competitors", icon: Users },
  { id: "citations", label: "Sources & citations", icon: Link2 },
  { id: "opportunities", label: "Opportunities", icon: Lightbulb },
  { id: "history", label: "Audit history", icon: History },
  { id: "reports", label: "Reports", icon: FileText },
] as const;
const TITLES: Record<View, { title: string; description: string }> = {
  overview: {
    title: "Overview",
    description: "Your brand, through the lens of AI.",
  },
  prompts: {
    title: "Prompt tracking",
    description:
      "The questions that matter. The answers that shape your brand.",
  },
  competitors: {
    title: "Competitive landscape",
    description: "Understand who gets recommended, and where you stand.",
  },
  citations: {
    title: "Sources & citations",
    description: "Meet the sources shaping what AI says about your category.",
  },
  opportunities: {
    title: "Your next moves",
    description: "Turn the gaps in AI answers into your next advantage.",
  },
  history: {
    title: "Audit history",
    description: "Every answer, every source, every change. Yours to keep.",
  },
  reports: {
    title: "Reports & agent handoff",
    description: "Keep the evidence. Share a clear next step.",
  },
  guide: {
    title: "A little clarity goes a long way.",
    description: "How Treg Lens turns AI answers into a clearer picture.",
  },
};
const COLORS = ["#118453", "#9c9dca", "#dfb66a", "#93b6c5"];
const STORE = "treg-lens-workspace-v1";
function n(value: number, digits = 0) {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}
function shortDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
function EngineMark({ engine, size = 20 }: { engine: string; size?: number }) {
  return (
    <img
      className="engine-mark"
      src={`/engines/${engine}.svg`}
      alt={ENGINES.find((e) => e.id === engine)?.name || engine}
      width={size}
      height={size}
    />
  );
}
function EngineStack({
  engines = ENGINES.map((e) => e.id),
}: {
  engines?: string[];
}) {
  return (
    <span className="engine-stack">
      {engines.map((e) => (
        <span key={e}>
          <EngineMark engine={e} size={15} />
        </span>
      ))}
    </span>
  );
}
function BrandMark({ small = false }: { small?: boolean }) {
  return (
    <span className={`brand-mark ${small ? "small" : ""}`}>
      <span />
      <span />
    </span>
  );
}
function Empty({
  title,
  description,
  onRun,
}: {
  title: string;
  description: string;
  onRun?: () => void;
}) {
  return (
    <div className="empty-state">
      <span className="empty-symbol">
        <Target size={25} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {onRun && (
        <button className="button primary" onClick={onRun}>
          <Zap size={15} /> Run an audit
        </button>
      )}
    </div>
  );
}
function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`native-modal ${wide ? "wide" : ""}`}
      aria-label={title}
      onCancel={onClose}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const focusable = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex="0"]',
          ),
        ).filter((element) => element.getClientRects().length > 0);
        event.preventDefault();
        const active = focusable.indexOf(document.activeElement as HTMLElement);
        const next = active < 0
          ? event.shiftKey ? focusable.length - 1 : 0
          : (active + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length;
        focusable[next]?.focus();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-top">
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export default function Workspace({
  demoMode = false,
  storageId,
  reviewOnboarding = false,
}: {
  demoMode?: boolean;
  storageId?: string;
  reviewOnboarding?: boolean;
}) {
  const router = useRouter();
  const storageKey = storageId ? `${STORE}:${storageId}` : STORE;
  const [loggingOut, setLoggingOut] = useState(false);
  const [view, setView] = useState<View>("overview");
  const workspace = useServerWorkspace(storageKey, demoMode);
  const { snapshot: { project, prompts, runs, sourceResearch }, sync, loaded } = workspace;
  const setProject = (action: SetStateAction<Project>) => workspace.field("project", action);
  const setPrompts = (action: SetStateAction<string[]>) => workspace.change((current) => {
    const next = typeof action === "function" ? action(current.prompts) : action;
    const previous = syncPromptRecords(current.promptRecords, current.prompts, current.project);
    return { ...current, prompts: next, promptRecords: syncPromptRecords(previous, next, current.project) };
  });
  const promptRecords = useMemo(() => syncPromptRecords(workspace.snapshot.promptRecords, prompts, project), [workspace.snapshot.promptRecords, prompts, project]);
  const changePromptRecords = (records: PromptRecord[]) => workspace.change((current) => ({ ...current, promptRecords: records, prompts: activePromptTexts(records) }));
  const setRuns = (action: SetStateAction<SavedRun[]>) => workspace.field("runs", action);
  const setSourceResearch = (action: SetStateAction<Record<string, SourceResearch>>) => workspace.field("sourceResearch", action);
  const [backupOpen, setBackupOpen] = useState(false);
  const [monitorOpen, setMonitorOpen] = useState(false);
  const [confirmServer, setConfirmServer] = useState(false);
  const auditProject = useRef<Project>(project);
  const [token, setToken] = useState("");
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditFollowup, setAuditFollowup] = useState<{ planId: string; updatedAt: string; input: ReturnType<typeof buildPagePlanFollowup>["input"] } | undefined>();
  const [auditPrompts, setAuditPrompts] = useState<string[] | undefined>(
    undefined,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [finishingOnboarding, setFinishingOnboarding] = useState(false);
  const [discoveryOpen, setDiscoveryOpen] = useState(false);
  const [discoveryTarget, setDiscoveryTarget] = useState<string | undefined>();
  const [discoveryRequest, setDiscoveryRequest] = useState(0);
  const [continuityTarget, setContinuityTarget] = useState<{ request: number; planId?: string; reportId?: string } | null>(null);
  const continuityRequest = useRef(0);
  const discoveryRunning = useRef(false);
  const [researchSource, setResearchSource] = useState<{
    url: string;
    domain: string;
  } | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [range, setRange] = useState(28);
  const [engine, setEngine] = useState("all");
  const [query, setQuery] = useState("");
  const [promptFilter, setPromptFilter] = useState("all");
  const [newPrompt, setNewPrompt] = useState<string | null>(null);
  const [selectedPrompt, setSelectedPrompt] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<SavedRun | null>(null);
  const [findingAnswer, setFindingAnswer] = useState<AnswerResult | null>(null);
  const [researchHistoryOpen, setResearchHistoryOpen] = useState(false);
  const [researchHistoryTarget, setResearchHistoryTarget] = useState<string | undefined>();
  const [toast, setToast] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const workspaceHeading = useRef<HTMLHeadingElement>(null);
  const workspaceSync = useRef<HTMLElement>(null);
  const wasReviewing = useRef(reviewOnboarding);
  useEffect(() => {
    const returning = wasReviewing.current && !reviewOnboarding;
    wasReviewing.current = reviewOnboarding;
    if (returning && !auditOpen) {
      const frame = requestAnimationFrame(() => workspaceHeading.current?.focus());
      return () => cancelAnimationFrame(frame);
    }
  }, [reviewOnboarding, auditOpen]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "Escape") {
        setQuery("");
        setExportOpen(false);
        setNotificationsOpen(false);
        setMobileOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  const projectRuns = useMemo(
    () =>
      runs.filter(
        (r) =>
          r.brand.toLowerCase() === project.brand.toLowerCase() &&
          normalizeDomain(r.domain) === normalizeDomain(project.domain),
      ).sort((a, b) => Date.parse(a.completedAt) - Date.parse(b.completedAt)),
    [runs, project],
  );
  const demo = demoMode;
  const allRuns = useMemo(
    () => (demo ? createDemoRuns() : projectRuns),
    [demo, projectRuns],
  );
  const latest = allRuns.at(-1)?.completedAt;
  const filteredRuns = useMemo(() => {
    if (!latest) return [];
    const cutoff = new Date(latest).getTime() - (range - 1) * 86400000;
    return allRuns.filter((r) => new Date(r.completedAt).getTime() >= cutoff);
  }, [allRuns, latest, range]);
  const results = useMemo(
    () =>
      filteredRuns
        .flatMap((r) => r.results)
        .filter((r) => engine === "all" || r.engine === engine),
    [filteredRuns, engine],
  );
  const score = visibility(results, project.domain);
  const mentions = results.filter((r) => r.brandMentioned).length;
  const trackedBrands = new Set(
    [project.brand, ...project.competitors].map((b) => b.toLowerCase()),
  );
  const totalMentions = results.reduce(
    (sum, r) =>
      sum +
      r.mentionedBrands.filter((b) => trackedBrands.has(b.toLowerCase()))
        .length,
    0,
  );
  const share = totalMentions ? (mentions / totalMentions) * 100 : 0;
  const citations = results.reduce((sum, r) => sum + r.citations.length, 0);
  const ownCitations = results.filter((r) =>
    r.citations.some(
      (c) =>
        normalizeDomain(c.domain || c.url) === normalizeDomain(project.domain),
    ),
  ).length;
  const positions = results
    .filter((r) => r.brandMentioned && r.position)
    .map((r) => r.position as number);
  const position = positions.length
    ? positions.reduce((a, b) => a + b, 0) / positions.length
    : 0;
  const brands = brandStats(results, [project.brand, ...project.competitors]);
  const sources = sourceStats(results);
  const gaps = useMemo(() => pagePlanOpportunities(allRuns, project).filter((item) => item.absent > 0), [allRuns, project]);
  const savePlans = async (plans: PagePlan[]) => {
    if (demoMode) { router.push("/login"); throw new Error("Sign in to save a page plan."); }
    workspace.field("pagePlans", plans);
    if (!await workspace.save()) throw new Error("Your page-plan draft is retained locally. Resolve workspace synchronization before continuing.");
  };
  const saveStrategy = async (strategy: Project["strategy"]) => {
    workspace.field("project", (previous) => ({ ...previous, strategy }));
    if (!await workspace.save()) throw new Error("Your context is retained locally. Resolve workspace synchronization before continuing.");
  };
  const saveReport = async (report: EvidenceReport) => {
    if (demoMode) return false;
    workspace.field("reports", (previous) => [...(previous ?? []).filter((item) => item.id !== report.id), report]);
    return workspace.save();
  };
  const deleteReport = async (reportId: string) => {
    if (demoMode) return false;
    workspace.field("reports", (previous) => (previous ?? []).filter((item) => item.id !== reportId));
    return workspace.save();
  };
  const reviewFollowup = async (plan: PagePlan) => {
    if (demoMode) { router.push("/login"); return; }
    if (!await workspace.save()) { setToast("Save your changes and resolve synchronization before reviewing a follow-up."); return; }
    try {
      const original = buildPagePlanFollowup(plan, runs);
      auditProject.current = project;
      setAuditFollowup({ planId: plan.id, updatedAt: plan.updatedAt, input: original.input });
      setAuditPrompts(original.input.prompts);
      setAuditOpen(true);
    } catch (error) { setToast(error instanceof Error ? error.message : "The original collection settings are unavailable."); }
  };
  const nav = (id: View) => {
    setContinuityTarget(null);
    setView(id);
    setMobileOpen(false);
    setQuery("");
    setExportOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const openDiscovery = (receiptId?: string, forceRecovery = false) => {
    if (discoveryRunning.current) { setDiscoveryOpen(true); return; }
    if (receiptId || forceRecovery || discoveryTarget) setDiscoveryRequest((value) => value + 1);
    setDiscoveryTarget(receiptId);
    setDiscoveryOpen(true);
  };
  const continuityAction = (action: ContinuityAction) => {
    const sameBrand = (name: string, domain: string) => name.trim().toLowerCase() === project.brand.trim().toLowerCase() && normalizeDomain(domain) === normalizeDomain(project.domain);
    const missing = () => setToast("That saved record is no longer available for this brand. Refresh the workspace to review its latest version.");
    if (action.kind === "audit") { void onRun(); return; }
    if (action.kind === "run") {
      const run = runs.find((item) => item.id === action.id && sameBrand(item.brand, item.domain));
      if (run) setSelectedRun(run); else missing();
      return;
    }
    if (action.kind === "plan") {
      const plan = workspace.snapshot.pagePlans?.find((item) => item.id === action.id && sameBrand(item.brand.name, item.brand.domain));
      if (!plan) { missing(); return; }
      nav("opportunities");
      setContinuityTarget({ request: ++continuityRequest.current, planId: plan.id });
      return;
    }
    if (action.kind === "report") {
      const report = workspace.snapshot.reports?.find((item) => item.id === action.id && sameBrand(item.project.brand, item.project.domain));
      if (!report) { missing(); return; }
      nav("reports"); setContinuityTarget({ request: ++continuityRequest.current, reportId: report.id });
      return;
    }
    if (action.kind === "reports") {
      nav("reports");
      if (action.id) setContinuityTarget({ request: ++continuityRequest.current, planId: action.id });
      requestAnimationFrame(() => workspaceHeading.current?.focus());
      return;
    }
    if (action.kind === "discovery") {
      const receipt = workspace.snapshot.discoveryResearch?.find((item) => item.id === action.id && sameBrand(item.input.brand, item.input.domain));
      if (receipt) openDiscovery(receipt.id); else missing();
      return;
    }
    if (action.kind === "research") {
      if (action.id && !project.researchReceipts?.some((item) => `${item.completedAt}:${item.url}` === action.id && sameBrand(item.brand, item.domain))) { missing(); return; }
      setResearchHistoryTarget(action.id); setResearchHistoryOpen(true); return;
    }
    nav("opportunities"); requestAnimationFrame(() => workspaceHeading.current?.focus());
  };
  const onRun = async () => {
    if (demoMode) {
      router.push("/login");
      return;
    }
    if (!await workspace.save()) {
      setToast("Your latest changes are not saved yet. Resolve synchronization before reviewing an audit.");
      return;
    }
    auditProject.current = project;
    setAuditFollowup(undefined);
    setAuditPrompts(undefined);
    setAuditOpen(true);
  };
  const finish = async (run: SavedRun, persistence?: AuditPersistence, followup = false) => {
    await workspace.acceptAudit(run, persistence, auditProject.current, followup);
    setToast(run.results.length ? `Audit complete. ${run.results.length} real AI answers added.` : "Audit recorded. All engines returned errors.");
  };
  const saveProject = (next: Project, nextToken: string) => {
    setProject((previous) => updateProjectProfile(previous, next));
    setToken(nextToken);

    setSettingsOpen(false);
    setToast("Workspace settings saved.");
  };
  const completeOnboarding = async (profile: Pick<WorkspaceSnapshot, "project" | "prompts">, openAudit: boolean, expectedRevision?: number) => {
    // Keep the review mounted until its exact snapshot is acknowledged by the server.
    setFinishingOnboarding(true);
    if (sync.phase === "conflict" || sync.phase === "offline" || sync.phase === "saving") return false;
    const next = { ...profile.project, onboardingCompletedAt: new Date().toISOString() };
    if (!await workspace.saveProfile({ project: next, prompts: profile.prompts }, { expectedRevision, preservePrompts: reviewOnboarding })) return false;
    setFinishingOnboarding(false);
    if (reviewOnboarding) router.replace("/app");
    if (openAudit) {
      auditProject.current = next;
      setAuditFollowup(undefined);
      setAuditPrompts(profile.prompts);
      setAuditOpen(true);
    }
    setToast("Your brand is ready. Review the estimate before starting an audit.");
    return true;
  };
  const rerunOnboarding = async () => {
    if (!await workspace.save() || !await workspace.refresh()) return false;
    setSettingsOpen(false);
    setAuditOpen(false);
    setDiscoveryOpen(false);
    setMobileOpen(false);
    setToast("");
    router.push("/app?setup=review");
    return true;
  };
  const openSettings = () => {
    if (demoMode) router.push("/login");
    else setSettingsOpen(true);
  };
  const logout = async () => {
    setLoggingOut(true);
    try {
      await workspace.save();
      const response = await fetch("/api/auth/session", { method: "DELETE" });
      if (!response.ok) throw new Error();
      setToken("");
      router.replace("/");
      router.refresh();
    } catch {
      setToast("Could not sign out. Please try again.");
      setLoggingOut(false);
    }
  };
  const exportData = (format: "csv" | "json") => {
    const filename = `treg-lens-${demo ? "demo-" : ""}${normalizeDomain(project.domain)}-${latest?.slice(0, 10) || "empty"}`;
    if (format === "csv")
      downloadFile(
        filename + ".csv",
        resultsCsv(results),
        "text/csv;charset=utf-8",
      );
    else
      downloadFile(
        filename + ".json",
        JSON.stringify(
          {
            version: 1,
            demo,
            project,
            exportedAt: new Date().toISOString(),
            rangeDays: range,
            engine,
            prompts,
            sourceResearch: Object.fromEntries(
              Object.entries(sourceResearch).filter(
                ([, research]) =>
                  research.brand.toLowerCase() === project.brand.toLowerCase(),
              ),
            ),
            runs: filteredRuns,
          },
          null,
          2,
        ),
      );
    setExportOpen(false);
    setToast(`${format.toUpperCase()} report exported.`);
  };
  const metricCards = [
    {
      name: "Visibility score",
      value: results.length ? n(score, 1) : "—",
      suffix: "/100",
      icon: Eye,
      detail: results.length ? "Saved answer sample" : "Your baseline awaits",
      foot: "scope-matched change is shown below",
      spark: [12, 17, 15, 23, 19, 30, 29, 36, 34, 45, 42, 54],
    },
    {
      name: "Share of voice",
      value: results.length ? n(share, 1) : "—",
      suffix: "%",
      icon: MessageSquareText,
      detail: `${n(mentions)} brand mentions`,
      foot: "of all tracked brand mentions",
      spark: [12, 11, 16, 14, 22, 20, 19, 27, 26, 30, 35, 38],
    },
    {
      name: "Citations",
      value: results.length ? n(citations) : "—",
      suffix: "",
      icon: Link2,
      detail: `${n(sources.length)} unique sources`,
      foot: `${n(ownCitations)} answers cite your domain`,
      spark: [8, 14, 12, 20, 17, 24, 19, 34, 32, 37, 33, 45],
    },
    {
      name: "Average position",
      value: positions.length ? n(position, 1) : "—",
      suffix: "",
      icon: Target,
      detail: positions.length
        ? `Top ${Math.ceil(position)} on average`
        : "No brand mentions yet",
      foot: "among brands in each answer",
      spark: [38, 36, 39, 31, 34, 27, 29, 21, 24, 18, 20, 12],
    },
  ];
  const visiblePrompts = prompts
    .filter((p) => p.toLowerCase().includes(query.toLowerCase()))
    .filter((p) => {
      const rows = results.filter((r) => r.prompt === p);
      return (
        promptFilter === "all" ||
        (promptFilter === "mentioned"
          ? rows.some((r) => r.brandMentioned)
          : rows.some((r) => !r.brandMentioned))
      );
    });
  const answerContent = (rows: AnswerResult[]) =>
    rows.length ? (
      <div className="answer-list">
        {rows.map((r) => (
          <article key={r.id} className="answer-card">
            <div className="answer-top">
              <span>
                <EngineMark engine={r.engine} />
                <b>{ENGINES.find((e) => e.id === r.engine)?.name}</b>
              </span>
              <span
                className={`status-tag ${r.brandMentioned ? "green" : "amber"}`}
              >
                {r.brandMentioned
                  ? `Mentioned #${r.position || "—"}`
                  : "Not mentioned"}
              </span>
            </div>
            <AnswerBody answer={r.answer} />
            <div className="answer-citations">
              {r.citations.map((c, i) => (
                <a
                  href={c.url}
                  target="_blank"
                  rel="noreferrer"
                  key={`${c.url}-${i}`}
                >
                  {c.domain}
                  <ArrowUpRight size={11} />
                </a>
              ))}
            </div>
            <div className="answer-meta">
              {shortDate(r.completedAt)} ·{" "}
              {demo
                ? "Illustrative answer"
                : r.costKnown === false
                  ? "Charge unavailable"
                  : `$${n(r.costUsd, 4)} actual cost`}{" "}
              · {r.sourceKind === "model-api" ? "Model API" : "Web answer"}
            </div>
          </article>
        ))}
      </div>
    ) : (
      <Empty
        title="No answers for this prompt yet"
        description="Include this prompt in your next audit to start tracking."
        onRun={onRun}
      />
    );
  if (!loaded) return <div className="workspace-loading" role="status"><p>Loading your saved workspace…</p></div>;
  const onboarding = !demoMode && (reviewOnboarding || finishingOnboarding || needsBrandOnboarding(workspace.snapshot)) ? (
      <BrandOnboarding
        initialProject={isExampleProfile(workspace.snapshot) ? { brand: "", domain: "", competitors: [] } : project}
        initialPrompts={isExampleProfile(workspace.snapshot) ? [] : prompts}
        storageKey={reviewOnboarding ? `${storageKey}:review` : storageKey}
        initialRevision={reviewOnboarding ? sync.revision ?? undefined : undefined}
        onComplete={completeOnboarding}
        onExit={reviewOnboarding ? async () => { await workspace.refresh(); setFinishingOnboarding(false); setToast("Brand review paused. Your draft is kept; your saved workspace is available."); router.replace("/app"); } : undefined}
        onReload={reviewOnboarding ? workspace.reloadProfile : undefined}
        onLogout={logout}
        error={sync.error || (loggingOut ? "Signing out…" : toast)}
        recovery={(sync.phase === "offline" || sync.phase === "conflict") && (
        <section ref={workspaceSync} tabIndex={-1} className={`workspace-sync is-${sync.phase}`} aria-label="Workspace synchronization">
          <span>{sync.phase === "conflict" ? "Conflicting workspace versions" : "Workspace connection unavailable"}</span>
          <p>{sync.error} Your onboarding draft stays in this browser.</p>
          <div className="sync-actions">
            <button className="button" onClick={() => downloadWorkspaceBackup(workspace.snapshot)}>Download unsaved workspace</button>
            <button className="button" onClick={() => { void workspace.retry(); }}>Retry sync</button>
            {sync.phase === "conflict" && !reviewOnboarding && <button className="button" onClick={async () => {
              if (window.confirm("Load the latest saved workspace? Your onboarding draft stays in this browser. Download any other unsaved workspace changes first.")) {
                if (await workspace.loadServer()) setFinishingOnboarding(false);
              }
            }}>Load server version</button>}
          </div>
        </section>
        )}
      />
  ) : null;
  return (
    <>
    {onboarding}
    <div
      className="app-shell"
      style={onboarding ? { display: "none" } : undefined}
      inert={!!onboarding}
      onClickCapture={(event) => {
        // Safari does not focus clicked buttons. Establish the opener before
        // mounting a dialog so closing it can return keyboard focus reliably.
        (event.target as Element).closest<HTMLButtonElement>("button")?.focus({
          preventScroll: true,
        });
      }}
    >
      {mobileOpen && (
        <button
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside className={`sidebar ${mobileOpen ? "is-open" : ""}`}>
        <Link className="wordmark" href="/" aria-label="Treg Lens home">
          <BrandMark />
          <span>
            treg<span className="lens-word">lens</span>
          </span>
        </Link>
        <button className="workspace-switch" onClick={openSettings}>
          <span className="workspace-avatar">
            {project.brand.slice(0, 1).toUpperCase()}
          </span>
          <span>
            <strong>{project.brand} workspace</strong>
            <small>{normalizeDomain(project.domain)}</small>
          </span>
          <ChevronDown size={14} />
        </button>
        <div className="nav-caption">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {NAV.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${view === item.id ? "active" : ""}`}
              onClick={() => nav(item.id)}
              aria-current={view === item.id ? "page" : undefined}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
              {item.id === "opportunities" && gaps.length > 0 && (
                <span className="nav-count">{gaps.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="nav-divider" />
        <div className="nav-caption">RESOURCES</div>
        <button
          className={`nav-item ${view === "guide" ? "active" : ""}`}
          onClick={() => nav("guide")}
        >
          <BookOpen size={18} />
          <span>The AEO playbook</span>
          <ArrowUpRight size={13} className="end-icon" />
        </button>
        <button className="nav-item" onClick={() => setSourceOpen(true)}>
          <Code2 size={18} />
          <span>Open source</span>
          <span className="oss-dot" />
        </button>
        <div className="sidebar-bottom">
          <div className="build-card">
            <span className="build-icon">
              <Sparkles size={17} />
            </span>
            <strong>Big insights. Tiny costs.</strong>
            <p>
              Your data. Your workspace.
              <br />
              Powered by the Treg toolkit.
            </p>
            <a href="https://treg.to/aeo" target="_blank" rel="noreferrer">
              Explore the toolkit <ArrowUpRight size={13} />
            </a>
          </div>
          <button className="nav-item" onClick={openSettings}>
            <Settings2 size={17} />
            <span>Settings</span>
          </button>
          <button className="profile-button" onClick={openSettings}>
            <span className="profile-avatar">T</span>
            <span>
              <strong>Your workspace</strong>
              <small>Open-source edition</small>
            </span>
            <MoreHorizontal size={17} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={21} />
            </button>
            <span className="breadcrumb-brand">Workspace</span>
            <ChevronRight size={12} />
            <strong>
              {NAV.find((i) => i.id === view)?.label || "The AEO playbook"}
            </strong>
          </div>
          <div className="topbar-actions">
            <div className="global-search">
              <Search size={15} />
              <input
                ref={searchRef}
                aria-label="Search prompts"
                placeholder="Search anything..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <kbd>⌘ K</kbd>
              {query && (
                <div className="search-results">
                  <span className="eyebrow">PROMPTS</span>
                  {prompts
                    .filter((p) =>
                      p.toLowerCase().includes(query.toLowerCase()),
                    )
                    .slice(0, 5)
                    .map((p) => (
                      <button
                        key={p}
                        onClick={() => {
                          setSelectedPrompt(p);
                          setQuery("");
                        }}
                      >
                        <MessageSquareText size={15} />
                        <span>{p}</span>
                        <ArrowUpRight size={13} />
                      </button>
                    ))}
                  {!prompts.some((p) =>
                    p.toLowerCase().includes(query.toLowerCase()),
                  ) && <p>No matching prompts. Try another search.</p>}
                </div>
              )}
            </div>
            <a
              className="icon-button help-button"
              href="https://treg.to/aeo"
              target="_blank"
              rel="noreferrer"
              aria-label="AEO toolkit help"
            >
              <CircleHelp size={18} />
            </a>
            <div className="popover-anchor">
              <button
                className="icon-button notification-button"
                aria-label="Notifications"
                onClick={() => setNotificationsOpen(!notificationsOpen)}
              >
                <Bell size={18} />
                {!demo && projectRuns.length > 0 && <i />}
              </button>
              {notificationsOpen && (
                <div className="small-popover notification-popover">
                  <strong>Workspace activity</strong>
                  <p>
                    {demo
                      ? "You’re exploring the demo workspace. Connect Treg and run an audit to collect your first real answers."
                      : latest
                        ? `Latest audit completed ${shortDate(latest)}. ${projectRuns.at(-1)?.results.length || 0} answers collected.`
                        : "Your workspace is ready for its first audit."}
                  </p>
                  <button
                    className="text-button"
                    onClick={() => {
                      onRun();
                      setNotificationsOpen(false);
                    }}
                  >
                    Run an audit <ArrowRight size={13} />
                  </button>
                </div>
              )}
            </div>
            {demoMode ? (
              <Link className="workspace-logout" href="/login">
                Connect Treg <ArrowRight size={12} />
              </Link>
            ) : (
              <button
                className="workspace-logout"
                onClick={logout}
                disabled={loggingOut}
              >
                <LogOut size={12} />
                {loggingOut ? "Signing out…" : "Sign out"}
              </button>
            )}
            <span className="topbar-avatar">T</span>
          </div>
        </header>
        <main className="main-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span className="live-dot" /> THE ANSWER ENGINE WORKSPACE
              </div>
              <h1 ref={workspaceHeading} tabIndex={-1}>{TITLES[view].title}</h1>
              <p>{TITLES[view].description}</p>
            </div>
            <div className="heading-actions">
              <div className="popover-anchor">
                <button
                  className="button"
                  onClick={() => setExportOpen(!exportOpen)}
                >
                  <ArrowDownToLine size={14} /> Export <ChevronDown size={12} />
                </button>
                {exportOpen && (
                  <div className="small-popover export-popover">
                    <button onClick={() => exportData("csv")}>
                      <FileText size={15} />
                      Download CSV
                    </button>
                    <button onClick={() => exportData("json")}>
                      <FileText size={15} />
                      Download JSON
                    </button>
                    {!demo && <button onClick={() => { downloadWorkspaceBackup(workspace.snapshot); setExportOpen(false); }}>Download full workspace backup</button>}
                  </div>
                )}
              </div>
              <button className="button primary" onClick={onRun}>
                <Plus size={16} /> Run an audit
              </button>
            </div>
          </div>
          {!demo && <section ref={workspaceSync} tabIndex={-1} className={`workspace-sync is-${sync.phase}`} aria-label="Workspace synchronization" aria-live="polite">
            <span>{sync.phase === "offline" || sync.phase === "conflict" ? <AlertTriangle size={14} /> : <Cloud size={14} />}{sync.phase === "saved" ? "Saved to server" : sync.phase === "saving" ? "Saving changes…" : sync.phase === "unsaved" ? "Unsaved changes" : sync.phase === "conflict" ? "Conflicting workspace versions" : "Unsynced · browser fallback"}</span>
            {sync.updatedAt && <small>Updated {new Date(sync.updatedAt).toLocaleTimeString()}</small>}
            <div className="sync-actions"><button className="button" onClick={() => { void workspace.refresh(); }} disabled={sync.phase === "saving"}><RefreshCw size={12} /> Refresh</button><button className="button" onClick={() => setBackupOpen(true)}>Backup and restore</button><button className="button" onClick={() => setMonitorOpen(true)}><Clock size={12} /> Monitoring</button>{(sync.phase === "offline" || sync.phase === "conflict") && <button className="button" onClick={() => { void workspace.retry(); }}>Retry sync</button>}{sync.phase === "conflict" && <button className="button" onClick={() => setConfirmServer(true)}>Load server version</button>}</div>
            {sync.error && <p>{sync.error}</p>}{sync.cacheError && <p>{sync.cacheError}</p>}
          </section>}
          {!demo && project.researchReceipts?.length ? <div className="profile-research-entry"><button className="button" onClick={() => { setResearchHistoryTarget(undefined); setResearchHistoryOpen(true); }}><BookOpen size={14} /> Brand research and sources</button><span>Your original research, sources and billing receipts stay with this workspace.</span></div> : null}
          {!demo && view === "overview" && <WorkspaceContinuity key={`${project.brand.toLowerCase()}:${normalizeDomain(project.domain)}`} snapshot={workspace.snapshot} syncPhase={sync.phase} storageKey={storageKey} recoveryRefreshKey={discoveryOpen} onAction={continuityAction} onDismiss={(stepId) => workspace.saveContinuity(setStepDismissed(workspace.snapshot, stepId), sync.revision)} onRecover={() => { workspaceSync.current?.scrollIntoView({ block: "center", behavior: "smooth" }); workspaceSync.current?.focus(); }} onRecoverDiscovery={() => openDiscovery(undefined, true)} onRecoverBrandResearch={() => { void rerunOnboarding(); }} onEditProfile={openSettings} onManageQuestions={() => nav("prompts")} />}
          {demo && (
            <div className="demo-strip">
              <span>
                <span className="demo-label">DEMO WORKSPACE</span> A little
                preview of the bigger picture. You’re viewing illustrative data.
              </span>
              <button onClick={onRun}>
                Make it yours <ArrowRight size={13} />
              </button>
            </div>
          )}
          {view === "overview" && (
            <>
              {!demo && projectRuns.at(-1) && <AuditFindings run={projectRuns.at(-1)!} onAnswer={setFindingAnswer} onRun={() => setSelectedRun(projectRuns.at(-1)!)} />}
              <section className="hero-banner">
                <div className="hero-copy">
                  <span className="hero-eyebrow">
                    <span /> TURN ANSWERS INTO ADVANTAGE
                  </span>
                  <h2>
                    Be the brand
                    <br />
                    AI recommends<span>.</span>
                  </h2>
                  <p>
                    See where you show up. Understand why. Find your next move.
                  </p>
                  <button onClick={() => nav("opportunities")}>
                    Find your opportunities <ArrowUpRight size={15} />
                  </button>
                </div>
                <div className="signal-art" aria-hidden="true">
                  <div className="signal-grid" />
                  <div className="orbit orbit-one" />
                  <div className="orbit orbit-two" />
                  <div className="orbit orbit-three" />
                  <div className="orbit-axis axis-one" />
                  <div className="orbit-axis axis-two" />
                  <span className="signal-core">
                    <BrandMark />
                  </span>
                  <span className="floating-engine fe-one">
                    <EngineMark engine="chatgpt" size={24} />
                  </span>
                  <span className="floating-engine fe-two">
                    <EngineMark engine="perplexity" size={24} />
                  </span>
                  <span className="floating-engine fe-three">
                    <EngineMark engine="gemini" size={24} />
                  </span>
                  <span className="floating-engine fe-four">
                    <EngineMark engine="google" size={24} />
                  </span>
                  <span className="signal-pill">
                    <span className="live-dot" /> One brand. Every answer.
                  </span>
                  <span className="art-plus plus-one">+</span>
                  <span className="art-plus plus-two">+</span>
                </div>
                <span className="hero-index">[ A CLEARER PERSPECTIVE ]</span>
              </section>
              <div className="section-toolbar">
                <div>
                  <h2>The big picture</h2>
                  <span className="subtle-divider" />
                  <span className="muted">
                    {demo
                      ? "Your example snapshot"
                      : latest
                        ? `Updated ${shortDate(latest)}`
                        : "Ready when you are"}
                  </span>
                </div>
                <select
                  value={range}
                  onChange={(e) => setRange(Number(e.target.value))}
                  aria-label="Date range"
                >
                  <option value={28}>28 days to latest audit</option>
                  <option value={14}>14 days to latest audit</option>
                  <option value={7}>7 days to latest audit</option>
                </select>
              </div>
              <div className="metric-grid">
                {metricCards.map((m, i) => (
                  <article className="metric-card" key={m.name}>
                    <div className="metric-top">
                      <span>{m.name}</span>
                      <m.icon size={16} />
                    </div>
                    <div className="metric-value">
                      {m.value}
                      <small>{m.suffix}</small>
                      {demo && (
                        <svg
                          className="sparkline"
                          viewBox="0 0 90 45"
                          aria-hidden="true"
                        >
                          <path
                            d={m.spark
                              .map(
                                (v, j) =>
                                  `${j ? "L" : "M"}${j * 8},${48 - v * 0.65}`,
                              )
                              .join(" ")}
                            stroke={i === 3 ? "#7ba493" : "#4c9b79"}
                            strokeWidth="1.6"
                            fill="none"
                          />
                        </svg>
                      )}
                    </div>
                    <div className="metric-change">
                      <span>
                        {i === 0 ? (
                          <TrendingUp size={12} />
                        ) : (
                          <span className="mini-dot" />
                        )}
                        {m.detail}
                      </span>
                      <small>{m.foot}</small>
                    </div>
                  </article>
                ))}
              </div>
              <div className="overview-middle">
                <VisibilityTrends
                  runs={filteredRuns}
                  project={project}
                  engine={engine}
                  onEngine={setEngine}
                  onRun={onRun}
                />
                <section className="panel ranking-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Share of voice</h2>
                      <p>Your category. Your competition.</p>
                    </div>
                    <button
                      className="icon-button"
                      aria-label="View competitor details"
                      onClick={() => nav("competitors")}
                    >
                      <ArrowUpRight size={17} />
                    </button>
                  </div>
                  <div className="ranking-label">
                    <span>BRAND</span>
                    <span>MENTION SHARE</span>
                  </div>
                  {brands.map((b, i) => (
                    <div
                      className={`rank-row ${b.brand === project.brand ? "you" : ""}`}
                      key={b.brand}
                    >
                      <span className="rank-index">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div className="rank-data">
                        <div>
                          <span
                            className={`mini-brand brand-${b.brand.toLowerCase()}`}
                          >
                            {b.brand === project.brand ? (
                              <BrandMark small />
                            ) : (
                              b.brand.slice(0, 1)
                            )}
                          </span>
                          <strong>{b.brand}</strong>
                          {b.brand === project.brand && (
                            <span className="you-tag">You</span>
                          )}
                          <b>
                            {n(
                              totalMentions
                                ? (b.mentions / totalMentions) * 100
                                : 0,
                              1,
                            )}
                            <small>%</small>
                          </b>
                        </div>
                        <div className="rank-track">
                          <span
                            style={{
                              width: `${totalMentions ? (b.mentions / totalMentions) * 100 : 0}%`,
                              background:
                                b.brand === project.brand
                                  ? "#118453"
                                  : COLORS[(i % 3) + 1],
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                  <button
                    className="panel-footer-button"
                    onClick={() => nav("competitors")}
                  >
                    Explore competitive landscape <ArrowRight size={14} />
                  </button>
                </section>
              </div>
              <div className="overview-bottom">
                <section className="panel engines-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>A different engine. A different story.</h2>
                      <p>See how your visibility stacks up across AI.</p>
                    </div>
                    <span className="outline-tag">4 ENGINES</span>
                  </div>
                  <div className="engine-cards">
                    {ENGINES.map((e) => {
                      const rows = results.filter((r) => r.engine === e.id);
                      const value = visibility(rows, project.domain);
                      return (
                        <button
                          key={e.id}
                          className="engine-card"
                          onClick={() => {
                            setEngine(e.id);
                            nav("prompts");
                          }}
                        >
                          <span className="engine-card-top">
                            <span className="engine-icon-box">
                              <EngineMark engine={e.id} size={21} />
                            </span>
                            <ArrowUpRight size={13} />
                          </span>
                          <strong>{e.name}</strong>
                          <div className="engine-card-value">
                            {rows.length ? n(value, 1) : "—"}
                            <small>/100</small>
                          </div>
                          <span className="engine-track">
                            <i
                              style={{
                                width: `${value}%`,
                                background: e.color,
                              }}
                            />
                          </span>
                          <span className="engine-caption">
                            {rows.length
                              ? n(mentionRate(rows), 0) + "% mention rate"
                              : "No answers yet"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
                <section className="panel next-panel">
                  <div className="panel-heading">
                    <div>
                      <span className="tiny-eyebrow">
                        <Sparkles size={12} /> SMALL MOVES, BIG POTENTIAL
                      </span>
                      <h2>Your next best move</h2>
                    </div>
                  </div>
                  <div className="next-content">
                    <span className="next-icon">
                      <Lightbulb size={21} />
                    </span>
                    <span className="status-tag green">
                      {gaps.length
                        ? "OPPORTUNITY DETECTED"
                        : "READY TO EXPLORE"}
                    </span>
                    <h3>
                      {gaps.length
                        ? "There’s room in the conversation."
                        : "Start with a little curiosity."}
                    </h3>
                    <p>
                      {gaps.length
                        ? `${gaps.length} questions have answered checks that don’t mention ${project.brand}. Inspect the evidence and save a page plan.`
                        : "Run an audit to find the questions where your brand can make its mark."}
                    </p>
                    <button
                      className="text-button"
                      onClick={() =>
                        gaps.length ? nav("opportunities") : onRun()
                      }
                    >
                      {gaps.length
                        ? "Explore opportunities"
                        : "Run your first audit"}
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </section>
              </div>
            </>
          )}
          {view === "prompts" && (
            <>
              <div className="view-toolbar">
                <div className="filter-tabs">
                  {[
                    ["all", "All prompts"],
                    ["mentioned", "Mentioned"],
                    ["missing", "Visibility gaps"],
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      className={promptFilter === id ? "selected" : ""}
                      onClick={() => setPromptFilter(id)}
                    >
                      {label}
                      {id === "all" && <span>{prompts.length}</span>}
                    </button>
                  ))}
                </div>
                <div className="inline-actions">
                  <select
                    value={engine}
                    onChange={(e) => setEngine(e.target.value)}
                    aria-label="Filter prompts by engine"
                  >
                    <option value="all">All engines</option>
                    {ENGINES.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="button"
                    onClick={() =>
                      demoMode ? router.push("/login") : openDiscovery()
                    }
                  >
                    <Sparkles size={14} /> Discover prompts
                  </button>
                  <button className="button" onClick={() => setNewPrompt("")}>
                    <Plus size={15} /> Add prompt
                  </button>
                </div>
              </div>
              <section className="panel table-panel">
                <div className="data-table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>BUYER QUESTION</th>
                        <th>ENGINES</th>
                        <th>VISIBILITY</th>
                        <th>MENTION RATE</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {visiblePrompts.map((p, i) => {
                        const rows = results.filter((r) => r.prompt === p);
                        const value = visibility(rows, project.domain);
                        return (
                          <tr key={p}>
                            <td>
                              <button
                                className="prompt-cell"
                                onClick={() => setSelectedPrompt(p)}
                              >
                                <span className="prompt-number">
                                  {String(i + 1).padStart(2, "0")}
                                </span>
                                <span>
                                  {p}
                                  <small>
                                    Buyer question <span>·</span> {rows.length}{" "}
                                    answers
                                  </small>
                                </span>
                              </button>
                            </td>
                            <td>
                              <EngineStack
                                engines={[
                                  ...new Set(rows.map((r) => r.engine)),
                                ]}
                              />
                            </td>
                            <td>
                              <div className="table-score">
                                <span className="table-score-track">
                                  <i style={{ width: `${value}%` }} />
                                </span>
                                <b>{rows.length ? n(value, 1) : "—"}</b>
                              </div>
                            </td>
                            <td>
                              <span
                                className={`status-tag ${mentionRate(rows) > 60 ? "green" : "neutral"}`}
                              >
                                {rows.length
                                  ? n(mentionRate(rows)) + "%"
                                  : "Untracked"}
                              </span>
                            </td>
                            <td>
                              <button
                                className="icon-button"
                                aria-label={`Remove prompt: ${p}`}
                                onClick={() => {
                                  setPrompts((old) =>
                                    old.filter((item) => item !== p),
                                  );
                                  setToast(
                                    "Prompt removed. Existing audit answers are preserved.",
                                  );
                                }}
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {!visiblePrompts.length && (
                  <Empty
                    title="No prompts here yet"
                    description="Add a buyer question or try a different filter."
                  />
                )}
                <div className="table-bottom">
                  <span>
                    {visiblePrompts.length} prompts · {results.length} answers
                    in selected period
                  </span>
                  <span>
                    Click a question to explore its answers{" "}
                    <ArrowUpRight size={12} />
                  </span>
                </div>
              </section>
              <PromptLibrary records={promptRecords} project={project}
                monitoringNotice="These controls change your question library. Already approved monitoring keeps its saved questions until you deliberately edit its schedule."
                onChange={changePromptRecords}
                onAudit={(text) => { if (demoMode) router.push("/login"); else { auditProject.current = project; setAuditFollowup(undefined); setAuditPrompts([text]); setAuditOpen(true); } }} />
            </>
          )}
          {view === "competitors" && (
            <>
              <section className="competitor-intro">
                <span className="intro-icon">
                  <Users size={25} />
                </span>
                <div>
                  <h2>You’re part of a bigger conversation.</h2>
                  <p>
                    Track your brand alongside the alternatives your customers
                    are considering.
                  </p>
                </div>
                <button className="button" onClick={openSettings}>
                  <Plus size={14} /> Manage competitors
                </button>
              </section>
              <div className="competitor-cards">
                {brands.map((b, i) => (
                  <section
                    className={`panel competitor-card ${b.brand === project.brand ? "own-brand" : ""}`}
                    key={b.brand}
                  >
                    <div className="competitor-card-top">
                      <span className="competitor-logo">
                        {b.brand === project.brand ? (
                          <BrandMark />
                        ) : (
                          b.brand.slice(0, 1)
                        )}
                      </span>
                      <span className="rank-badge">#{i + 1} IN YOUR SET</span>
                    </div>
                    <h2>
                      {b.brand}
                      {b.brand === project.brand && (
                        <span className="you-tag">You</span>
                      )}
                    </h2>
                    <span className="muted">
                      {b.brand === project.brand
                        ? project.domain
                        : "Tracked competitor"}
                    </span>
                    <div className="competitor-big-value">
                      {n(b.visibility, 1)}
                      <small>%</small>
                    </div>
                    <span className="muted">of answers mention this brand</span>
                    <div className="competitor-card-stats">
                      <div>
                        <strong>{b.mentions}</strong>
                        <span>Mentions</span>
                      </div>
                      <div>
                        <strong>{b.position ? n(b.position, 1) : "—"}</strong>
                        <span>Avg. position</span>
                      </div>
                    </div>
                  </section>
                ))}
              </div>
              <VisibilityTrends
                runs={filteredRuns}
                project={project}
                engine={engine}
                onEngine={setEngine}
                onRun={onRun}
              />
              <div className="method-note">
                <CircleHelp size={15} />
                <p>
                  Brands are matched against your configured brand names.
                  Position uses a numbered recommendation rank when returned;
                  otherwise it is inferred from the first mention among detected
                  brands.
                </p>
              </div>
            </>
          )}
          {view === "citations" && <CitationExplorer
            runs={filteredRuns.map((run) => ({ ...run, results: run.results.filter((answer) => engine === "all" || answer.engine === engine), errors: run.errors.filter((issue) => engine === "all" || issue.engine === engine) }))}
            project={project}
            onAnswer={setFindingAnswer}
            onResearch={(source) => demoMode ? router.push("/login") : setResearchSource(source)}
          />}
          {view === "opportunities" && <PagePlans key={continuityTarget?.request ?? "plans"} initialPlanId={continuityTarget?.planId} onTargetClose={() => requestAnimationFrame(() => workspaceHeading.current?.focus())} project={project} runs={allRuns} plans={workspace.snapshot.pagePlans ?? []} onSave={savePlans} onSaveStrategy={saveStrategy} onFollowup={reviewFollowup} legacyDone={workspace.snapshot.done} disabled={demoMode} />}
          {view === "reports" && <EvidenceReports key={continuityTarget?.request ?? "reports"} initialReportId={continuityTarget?.reportId} initialPlanId={continuityTarget?.planId} onTargetClose={() => requestAnimationFrame(() => workspaceHeading.current?.focus())} project={project} runs={allRuns} plans={workspace.snapshot.pagePlans ?? []} reports={workspace.snapshot.reports ?? []} onSave={saveReport} onDelete={deleteReport} synced={sync.phase === "saved"} demo={demoMode} />}
          {view === "history" && (
            <>
              <div className="section-toolbar">
                <div>
                  <h2>{demo ? "Example audit history" : "Your audit trail"}</h2>
                  <span className="outline-tag">{allRuns.length} RUNS</span>
                </div>
                <span className="muted">
                  {demo ? "Illustrative sample history" : "Saved to your server · export a full backup"}
                </span>
              </div>
              <section className="panel table-panel">
                <table>
                  <thead>
                    <tr>
                      <th>AUDIT</th>
                      <th>DATE</th>
                      <th>ENGINES</th>
                      <th>ANSWERS</th>
                      <th>VISIBILITY</th>
                      <th>ACTUAL COST</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {[...allRuns].reverse().map((run, i) => (
                      <tr key={run.id}>
                        <td>
                          <button
                            className="history-name"
                            onClick={() => setSelectedRun(run)}
                          >
                            <span className="source-icon">
                              <BarChart3 size={16} />
                            </span>
                            <strong>
                              {project.brand} visibility audit
                              <small>
                                {demo
                                  ? "Illustrative run"
                                  : `${run.errors.length} failed answers`}
                              </small>
                            </strong>
                          </button>
                        </td>
                        <td>
                          {shortDate(run.completedAt)}
                          {i === 0 && (
                            <span className="latest-tag">Latest</span>
                          )}
                        </td>
                        <td>
                          <EngineStack
                            engines={[
                              ...new Set(run.results.map((r) => r.engine)),
                            ]}
                          />
                        </td>
                        <td>{run.results.length}</td>
                        <td>
                          <b>{n(visibility(run.results, project.domain), 1)}</b>
                          <span className="muted"> /100</span>
                        </td>
                        <td>
                          {demo
                            ? "Demo"
                            : run.totalCostKnown === false
                              ? "Unknown"
                              : `$${n(run.totalCostUsd, 4)}`}
                        </td>
                        <td>
                          <button
                            className="icon-button"
                            aria-label="Open audit"
                            onClick={() => setSelectedRun(run)}
                          >
                            <ArrowUpRight size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!allRuns.length && (
                  <Empty
                    title="Your story starts with one audit."
                    description="Run an audit and keep a baseline you can compare against later."
                    onRun={onRun}
                  />
                )}
              </section>
            </>
          )}
          {view === "guide" && (
            <>
              <div className="playbook-hero">
                <span className="eyebrow">OPEN TOOLS. CLEAR ANSWERS.</span>
                <h2>
                  Get on the map.
                  <br />
                  Then keep moving.
                </h2>
                <p>
                  Treg Lens brings the measurement step of the open-source AEO
                  toolkit into one focused workspace. Make a baseline,
                  understand the sources, then come back and measure what
                  changed.
                </p>
                <a
                  className="button primary"
                  href="https://treg.to/aeo"
                  target="_blank"
                  rel="noreferrer"
                >
                  Read the full AEO workflow <ArrowUpRight size={15} />
                </a>
              </div>
              <div className="playbook-grid">
                {[
                  {
                    title: "Ask the right questions.",
                    description:
                      "Add real buyer questions. Focus on discovery, comparison, and choosing a product. Track the same questions over time.",
                    icon: MessageSquareText,
                  },
                  {
                    title: "See who gets named.",
                    description:
                      "Run your questions across ChatGPT, Perplexity, Gemini, and Google AI Mode. Inspect complete answers and the order brands appear.",
                    icon: Eye,
                  },
                  {
                    title: "Follow the citations.",
                    description:
                      "See which sources the engines cite. Use the full toolkit to investigate page strength, linking domains, and source opportunities.",
                    icon: Link2,
                  },
                  {
                    title: "Make your next move.",
                    description:
                      "Write useful content for missing questions. Review every claim, publish it yourself, then recheck your baseline in 3–4 weeks.",
                    icon: TrendingUp,
                  },
                ].map((s, i) => (
                  <article className="panel" key={s.title}>
                    <span className="playbook-step">
                      0{i + 1}
                      <s.icon size={21} />
                    </span>
                    <h3>{s.title}</h3>
                    <p>{s.description}</p>
                  </article>
                ))}
              </div>
              <section className="panel methodology">
                <h2>The numbers, with nothing hidden.</h2>
                <p>
                  Visibility score follows the Treg AEO toolkit: for each
                  successful answer, add 50 points if your brand is mentioned,
                  30 divided by the brand’s first-mention position, and 20 if
                  your own domain is cited. Position uses a numbered
                  recommendation rank when available, otherwise inferred
                  first-mention order. Average across successful answers. The
                  trend chart compares brand mention rates across engines and
                  brands.
                </p>
                <code>
                  Visibility = mean(50 × mentioned + 30 × mentioned / position +
                  20 × cited)
                </code>
                <p>
                  Share of voice is your mentions divided by all mentions of
                  tracked brands. Failed engines are excluded. Trends compare matching question and collector scopes with coverage shown. Legacy evidence keeps its original history without an inferred comparison. Demo data is always labeled.
                  Perplexity uses the Sonar model API; the other engines return
                  web answers.
                </p>
              </section>
            </>
          )}
          <footer className="page-footer">
            <span>
              <BrandMark small /> A clearer perspective, powered by{" "}
              <a href="https://treg.to/aeo" target="_blank" rel="noreferrer">
                treg.
              </a>
            </span>
            <span>
              Built in the open. Yours to explore.
              <button onClick={() => setSourceOpen(true)}>
                MIT licensed <ArrowUpRight size={11} />
              </button>
            </span>
          </footer>
        </main>
      </div>
      {!demo && <WorkspaceBackup open={backupOpen} onClose={() => setBackupOpen(false)} snapshot={workspace.snapshot} onRestore={(next) => { workspace.change(next); setToast("Backup restored in this tab. Server synchronization is pending."); }} />}
      {!demo && monitorOpen && <MonitorSettings open onClose={() => setMonitorOpen(false)} project={project} prompts={prompts} />}
      {confirmServer && <Modal title="Load the server workspace?" onClose={() => setConfirmServer(false)}><p className="modal-description">Your unsynced local changes will be replaced by the latest saved server version. Download a full backup first to retain both versions.</p><div className="modal-actions"><button className="button" onClick={() => downloadWorkspaceBackup(workspace.snapshot)}>Download local backup</button><button className="button" onClick={() => setConfirmServer(false)}>Cancel</button><button className="button primary" onClick={async () => { if (await workspace.loadServer()) setConfirmServer(false); }}>Confirm load server version</button></div></Modal>}
      <AuditDialog
        open={auditOpen}
        onClose={() => setAuditOpen(false)}
        onComplete={(run, persistence) => { void finish(run, persistence, Boolean(auditFollowup)); }}
        followup={auditFollowup}
        project={project}
        initialPrompts={auditPrompts || prompts.slice(0, 8)}
        token={token}
      />
      <DiscoveryDialog
        key={discoveryRequest}
        initialReceiptId={discoveryTarget}
        onRunningChange={(running) => { discoveryRunning.current = running; }}
        open={discoveryOpen}
        onClose={() => setDiscoveryOpen(false)}
        project={project}
        storageKey={storageKey}
        savedResearch={workspace.snapshot.discoveryResearch ?? []}
        token={token}
        onSave={(receipt: SavedDiscovery) => workspace.saveDiscovery(receipt)}
        onAdd={async (receipt: SavedDiscovery, selectedIds: string[]) => {
          const saved = await workspace.saveDiscovery(receipt, selectedIds);
          if (saved) setToast(`${selectedIds.length} discovered prompts added.`);
          return saved;
        }}
      />
      {researchSource && (
        <SourceDialog
          open
          onClose={() => setResearchSource(null)}
          source={researchSource}
          brand={project.brand}
          token={token}
          initialResearch={
            sourceResearch[
              `${project.brand.toLowerCase()}:${researchSource.url}`
            ]
          }
          onComplete={(research) =>
            setSourceResearch((old) => ({
              ...old,
              [`${project.brand.toLowerCase()}:${research.url}`]: research,
            }))
          }
        />
      )}
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        project={project}
        token={token}
        onSave={saveProject}
        onRerunOnboarding={demoMode ? undefined : rerunOnboarding}
      />
      {newPrompt !== null && (
        <Modal
          title="A good question opens doors."
          onClose={() => setNewPrompt(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const text = newPrompt.trim();
              if (!text) return;
              if (prompts.some((p) => p.toLowerCase() === text.toLowerCase())) {
                setToast("You’re already tracking this question.");
                return;
              }
              setPrompts((old) => [...old, text]);
              setNewPrompt(null);
              setToast("Prompt added. Include it in your next audit.");
            }}
          >
            <p className="modal-description">
              Add a question your customers might ask an AI engine.
            </p>
            <label className="field-label" htmlFor="new-prompt">
              Buyer question
            </label>
            <textarea
              id="new-prompt"
              autoFocus
              required
              maxLength={500}
              value={newPrompt}
              onChange={(e) => setNewPrompt(e.target.value)}
              placeholder="Which tools are best for…?"
            />
            <div className="modal-actions">
              <button
                type="button"
                className="button"
                onClick={() => setNewPrompt(null)}
              >
                Cancel
              </button>
              <button className="button primary" type="submit">
                <Plus size={15} /> Add prompt
              </button>
            </div>
          </form>
        </Modal>
      )}
      {selectedPrompt && (
        <Modal
          title="Behind the answer"
          onClose={() => setSelectedPrompt(null)}
          wide
        >
          <div className="prompt-detail-question">
            <MessageSquareText size={20} />
            <h3>{selectedPrompt}</h3>
          </div>
          <div className="detail-toolbar">
            <span>
              {demo ? "Illustrative answers" : "Real saved answers"} · latest
              answer per engine
            </span>
            <button
              className="button"
              onClick={() => {
                if (demoMode) {
                  setSelectedPrompt(null);
                  router.push("/login");
                  return;
                }
                auditProject.current = project;
                setAuditFollowup(undefined);
                setAuditPrompts([selectedPrompt]);
                setSelectedPrompt(null);
                setAuditOpen(true);
              }}
            >
              <Zap size={13} /> Recheck prompt
            </button>
          </div>
          {answerContent(
            ENGINES.flatMap((e) => {
              const row = results
                .filter((r) => r.prompt === selectedPrompt && r.engine === e.id)
                .at(-1);
              return row ? [row] : [];
            }),
          )}
        </Modal>
      )}
      {selectedRun && (
        <Modal
          title={`${project.brand} visibility audit`}
          onClose={() => setSelectedRun(null)}
          wide
        >
          <div className="detail-toolbar">
            <span>
              {shortDate(selectedRun.completedAt)} ·{" "}
              {selectedRun.results.length} answers ·{" "}
              {demo
                ? "Demo run"
                : selectedRun.totalCostKnown === false
                  ? "Charge unavailable"
                  : `$${n(selectedRun.totalCostUsd, 4)}`}
            </span>
            <button
              className="button"
              onClick={() =>
                downloadFile(
                  "treg-audit.json",
                  JSON.stringify({ demo, ...selectedRun }, null, 2),
                )
              }
            >
              <ArrowDownToLine size={14} /> Export audit
            </button>
          </div>
          {selectedRun.errors.length > 0 && (
            <div className="error-notice">
              {selectedRun.errors.map((e, i) => (
                <p key={i}>
                  {e.engine}: {e.error}
                </p>
              ))}
            </div>
          )}
          {!demo && <div className="detail-toolbar"><button className="button" onClick={() => downloadWorkspaceBackup(workspace.snapshot)}>Download full workspace backup</button><button className="button" onClick={() => { if (window.confirm("Delete this saved audit? Download a full workspace backup first. This removal will synchronize to your server.")) { setRuns((old) => old.filter((run) => run.id !== selectedRun.id)); setSelectedRun(null); setToast("Audit removed. Synchronizing the workspace…"); } }}>Delete this audit</button></div>}
          {answerContent(selectedRun.results)}
        </Modal>
      )}
      {findingAnswer && <Modal title="Answer evidence" onClose={() => setFindingAnswer(null)} wide><p className="modal-description">Buyer question: {findingAnswer.prompt}</p>{answerContent([findingAnswer])}</Modal>}
      {researchHistoryOpen && <Modal title="Brand research and sources" onClose={() => setResearchHistoryOpen(false)} wide><p className="modal-description">Original research is kept with its website and charge. Suggestions may belong to an earlier version of your profile; edits do not rewrite this evidence.</p><div className="profile-research-list">{[...(project.researchReceipts ?? [])].filter((receipt) => !researchHistoryTarget || `${receipt.completedAt}:${receipt.url}` === researchHistoryTarget).reverse().map((receipt, i) => <div key={receipt.completedAt + "-" + i}><p className="profile-context-note">Researched {new Date(receipt.completedAt).toLocaleString()} · {receipt.url}</p><ResearchReceipt receipt={receipt} currentDomain={project.domain} /></div>)}</div></Modal>}
      {sourceOpen && (
        <Modal title="Built in the open." onClose={() => setSourceOpen(false)}>
          <div className="source-modal">
            <Code2 size={34} />
            <p>
              Treg Lens is an independent, MIT-licensed AI visibility workspace
              inspired by Profound and powered by Treg’s open AEO toolkit.
            </p>
            <p>
              The complete source, self-hosting instructions, and contribution
              guide are included in this project. Your workspace is saved on your
              server with a browser fallback; Treg API calls use your own key.
            </p>
            <a
              className="button primary"
              href={GITHUB_REPOSITORY}
              target="_blank"
              rel="noreferrer"
            >
              Explore the source code <ExternalLink size={14} />
            </a>
          </div>
        </Modal>
      )}
      {toast && !onboarding && (
        <div className="toast" role="status">
          <span>
            <Check size={15} />
          </span>
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
    </>
  );
}
