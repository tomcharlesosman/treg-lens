"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GITHUB_REPOSITORY } from "@/lib/site";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  BookOpen,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Copy,
  ExternalLink,
  Eye,
  FileText,
  Code2,
  Globe2,
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
  ShieldCheck,
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
import SettingsDialog from "./settings-dialog";
import type { AnswerResult } from "@/lib/aeo";
import {
  DEFAULT_PROJECT,
  DEFAULT_PROMPTS,
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
  | "guide";
const NAV = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "prompts", label: "Prompt tracking", icon: MessageSquareText },
  { id: "competitors", label: "Competitors", icon: Users },
  { id: "citations", label: "Sources & citations", icon: Link2 },
  { id: "opportunities", label: "Opportunities", icon: Lightbulb },
  { id: "history", label: "Audit history", icon: History },
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
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`native-modal ${wide ? "wide" : ""}`}
      aria-label={title}
      onCancel={onClose}
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
function smoothPath(points: { x: number; y: number }[]) {
  return points
    .map((p, i) => {
      if (!i) return `M ${p.x},${p.y}`;
      const prev = points[i - 1];
      return `C ${prev.x + (p.x - prev.x) * 0.5},${prev.y} ${prev.x + (p.x - prev.x) * 0.5},${p.y} ${p.x},${p.y}`;
    })
    .join(" ");
}
function TrendChart({
  runs,
  project,
  engine,
  onEngine,
  onRun,
}: {
  runs: SavedRun[];
  project: Project;
  engine: string;
  onEngine: (e: string) => void;
  onRun: () => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const brands = [project.brand, ...project.competitors.slice(0, 3)];
  const groups = useMemo(() => {
    const days = new Map<string, AnswerResult[]>();
    runs.forEach((run) => {
      const day = run.completedAt.slice(0, 10);
      const filtered = run.results.filter(
        (r) => engine === "all" || r.engine === engine,
      );
      days.set(day, [...(days.get(day) || []), ...filtered]);
    });
    return [...days.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [runs, engine]);
  const series = brands.map((brand) =>
    groups.map(([, results]) =>
      results.length
        ? (100 *
            results.filter((r) =>
              r.mentionedBrands.some(
                (b) => b.toLowerCase() === brand.toLowerCase(),
              ),
            ).length) /
          results.length
        : 0,
    ),
  );
  const width = 640,
    height = 180;
  const coords = series.map((values) =>
    values.map((value, i) => ({
      x: groups.length > 1 ? (i / (groups.length - 1)) * width : width / 2,
      y: height - (value / 100) * height,
    })),
  );
  const latest = series[0]?.at(-1) || 0;
  const selected = hover !== null ? hover : groups.length - 1;
  return (
    <section className="panel trend-panel">
      <div className="panel-heading">
        <div>
          <h2>
            Visibility over time{" "}
            <span
              className="info-dot"
              title="Toolkit score: 50% mentions + 30% reciprocal rank + 20% own-domain citations."
            >
              i
            </span>
          </h2>
          <p>How often AI puts your brand in the picture.</p>
        </div>
        <select
          aria-label="Filter chart by engine"
          value={engine}
          onChange={(e) => onEngine(e.target.value)}
        >
          <option value="all">All engines</option>
          {ENGINES.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </div>
      {!groups.length ? (
        <Empty
          title="Your baseline starts here"
          description="Run your first audit to see how AI talks about your brand."
          onRun={onRun}
        />
      ) : (
        <>
          <div className="chart-summary">
            <strong>
              {n(latest, 1)}
              <span>%</span>
            </strong>
            <span className="chart-summary-note">
              <span className="live-dot" /> Mention rate
            </span>
          </div>
          <div className="chart">
            <div className="chart-y">
              {[100, 75, 50, 25, 0].map((v) => (
                <span key={v}>{v}</span>
              ))}
            </div>
            <div className="chart-plot">
              <svg
                viewBox={`0 0 ${width} ${height}`}
                preserveAspectRatio="none"
                aria-label="Brand mention rate trend"
                role="img"
                onMouseMove={(e) => {
                  const bounds = e.currentTarget.getBoundingClientRect();
                  setHover(
                    Math.max(
                      0,
                      Math.min(
                        groups.length - 1,
                        Math.round(
                          ((e.clientX - bounds.left) / bounds.width) *
                            (groups.length - 1),
                        ),
                      ),
                    ),
                  );
                }}
                onMouseLeave={() => setHover(null)}
              >
                <defs>
                  <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#118453" stopOpacity=".12" />
                    <stop offset="100%" stopColor="#118453" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {[0, 45, 90, 135, 180].map((y) => (
                  <line
                    key={y}
                    x1="0"
                    x2={width}
                    y1={y}
                    y2={y}
                    stroke="#e5e5e5"
                    strokeDasharray="3 4"
                  />
                ))}
                {coords[0]?.length > 1 && !hidden.includes(brands[0]) && (
                  <path
                    d={`${smoothPath(coords[0])} L ${width},${height} L 0,${height} Z`}
                    fill="url(#chart-fill)"
                  />
                )}
                {[...coords.keys()].reverse().map(
                  (i) =>
                    !hidden.includes(brands[i]) && (
                      <g key={brands[i]}>
                        <path
                          d={smoothPath(coords[i])}
                          fill="none"
                          stroke={COLORS[i]}
                          strokeWidth={i === 0 ? "2.8" : "1.6"}
                          strokeDasharray={i === 0 ? "" : "4 5"}
                          vectorEffect="non-scaling-stroke"
                        />
                        {coords[i].length === 1 && (
                          <circle
                            cx={coords[i][0].x}
                            cy={coords[i][0].y}
                            r="4"
                            fill={COLORS[i]}
                          />
                        )}
                      </g>
                    ),
                )}
                {hover !== null && (
                  <line
                    x1={coords[0][hover].x}
                    x2={coords[0][hover].x}
                    y1="0"
                    y2={height}
                    stroke="#b8c9c4"
                  />
                )}
                {hover !== null &&
                  coords.map(
                    (points, i) =>
                      !hidden.includes(brands[i]) && (
                        <circle
                          key={i}
                          cx={points[hover].x}
                          cy={points[hover].y}
                          r="4"
                          fill={COLORS[i]}
                          stroke="white"
                          strokeWidth="2"
                        />
                      ),
                  )}
              </svg>
              {hover !== null && (
                <div
                  className="chart-tooltip"
                  style={{
                    left: `${Math.min(78, Math.max(12, (hover / Math.max(1, groups.length - 1)) * 100))}%`,
                  }}
                >
                  <b>{shortDate(groups[selected][0])}</b>
                  {brands.map((b, i) => (
                    <span key={b}>
                      <i style={{ background: COLORS[i] }} />
                      {b}
                      <strong>{n(series[i][selected], 1)}</strong>
                    </span>
                  ))}
                </div>
              )}
              <div className="chart-x">
                {[
                  ...new Set([
                    0,
                    Math.floor((groups.length - 1) * 0.25),
                    Math.floor((groups.length - 1) * 0.5),
                    Math.floor((groups.length - 1) * 0.75),
                    groups.length - 1,
                  ]),
                ].map((i) => (
                  <span key={i}>{shortDate(groups[i][0])}</span>
                ))}
              </div>
            </div>
          </div>
          <div className="chart-legend">
            {brands.map((b, i) => (
              <button
                key={b}
                className={hidden.includes(b) ? "muted-legend" : ""}
                onClick={() =>
                  setHidden((old) =>
                    old.includes(b) ? old.filter((v) => v !== b) : [...old, b],
                  )
                }
              >
                <i style={{ background: COLORS[i] }} />
                {b}
                {i === 0 && <span>You</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

export default function Workspace({
  demoMode = false,
  storageId,
}: {
  demoMode?: boolean;
  storageId?: string;
}) {
  const router = useRouter();
  const storageKey = storageId ? `${STORE}:${storageId}` : STORE;
  const [loggingOut, setLoggingOut] = useState(false);
  const [view, setView] = useState<View>("overview");
  const [project, setProject] = useState<Project>(DEFAULT_PROJECT);
  const [prompts, setPrompts] = useState(DEFAULT_PROMPTS);
  const [runs, setRuns] = useState<SavedRun[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [token, setToken] = useState("");
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditPrompts, setAuditPrompts] = useState<string[] | undefined>(
    undefined,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [discoveryOpen, setDiscoveryOpen] = useState(false);
  const [researchSource, setResearchSource] = useState<{
    url: string;
    domain: string;
  } | null>(null);
  const [sourceResearch, setSourceResearch] = useState<
    Record<string, SourceResearch>
  >({});
  const [mobileOpen, setMobileOpen] = useState(false);
  const [range, setRange] = useState(28);
  const [engine, setEngine] = useState("all");
  const [query, setQuery] = useState("");
  const [promptFilter, setPromptFilter] = useState("all");
  const [newPrompt, setNewPrompt] = useState<string | null>(null);
  const [selectedPrompt, setSelectedPrompt] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<SavedRun | null>(null);
  const [brief, setBrief] = useState<string | null>(null);
  const [done, setDone] = useState<string[]>([]);
  const [toast, setToast] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  /* eslint-disable react-hooks/set-state-in-effect -- Restore the external browser workspace after hydration. */
  useEffect(() => {
    if (demoMode) {
      setLoaded(true);
      return;
    }
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (
        saved &&
        saved.project &&
        Array.isArray(saved.prompts) &&
        Array.isArray(saved.runs)
      ) {
        setProject(saved.project);
        setPrompts(saved.prompts);
        setRuns(saved.runs);
        setDone(saved.done || []);
        setSourceResearch(saved.sourceResearch || {});
      }
      sessionStorage.removeItem("treg-lens-token");
    } catch {}
    setLoaded(true);
  }, [demoMode, storageKey]);
  /* eslint-enable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (loaded && !demoMode)
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({ project, prompts, runs, done, sourceResearch }),
        );
      } catch {
        queueMicrotask(() =>
          setToast(
            "Browser storage is full. Export your audits to keep a backup.",
          ),
        );
      }
  }, [
    project,
    prompts,
    runs,
    done,
    sourceResearch,
    loaded,
    demoMode,
    storageKey,
  ]);
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
      ),
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
  const chronological = [...filteredRuns].sort((a, b) =>
    a.completedAt.localeCompare(b.completedAt),
  );
  const hasBaseline = chronological.length > 1;
  const firstAnswers =
    chronological[0]?.results.filter(
      (r) => engine === "all" || r.engine === engine,
    ) || [];
  const lastAnswers =
    chronological
      .at(-1)
      ?.results.filter((r) => engine === "all" || r.engine === engine) || [];
  const delta = hasBaseline
    ? visibility(lastAnswers, project.domain) -
      visibility(firstAnswers, project.domain)
    : 0;
  const gaps = useMemo(
    () =>
      prompts
        .map((prompt) => {
          const rows = results.filter((r) => r.prompt === prompt);
          return {
            prompt,
            rows,
            score: visibility(rows, project.domain),
            misses: rows.filter((r) => !r.brandMentioned).length,
          };
        })
        .filter((r) => r.misses > 0)
        .sort(
          (a, b) =>
            b.misses / Math.max(1, b.rows.length) -
            a.misses / Math.max(1, a.rows.length),
        ),
    [results, prompts, project.domain],
  );
  const nav = (id: View) => {
    setView(id);
    setMobileOpen(false);
    setQuery("");
    setExportOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const onRun = () => {
    if (demoMode) {
      router.push("/login");
      return;
    }
    setAuditPrompts(undefined);
    setAuditOpen(true);
  };
  const finish = (run: SavedRun) => {
    setRuns((old) => [...old, run]);
    setProject((old) => ({
      ...old,
      brand: run.brand,
      domain: run.domain,
      competitors: run.competitors || old.competitors,
    }));
    if (run.prompts)
      setPrompts((old) =>
        run.brand.toLowerCase() === project.brand.toLowerCase() &&
        normalizeDomain(run.domain) === normalizeDomain(project.domain)
          ? [...new Set([...old, ...run.prompts!])]
          : run.prompts!,
      );
    setToast(
      run.results.length
        ? `Audit complete. ${run.results.length} real AI answers added.`
        : "Audit recorded. All engines returned errors.",
    );
  };
  const saveProject = (next: Project, nextToken: string) => {
    setProject(next);
    setToken(nextToken);

    setSettingsOpen(false);
    setToast("Workspace settings saved.");
  };
  const openSettings = () => {
    if (demoMode) router.push("/login");
    else setSettingsOpen(true);
  };
  const logout = async () => {
    setLoggingOut(true);
    try {
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
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setToast("Copied to clipboard.");
    } catch {
      setToast("Clipboard unavailable. Select and copy the text manually.");
    }
  };
  const metricCards = [
    {
      name: "Visibility score",
      value: results.length ? n(score, 1) : "—",
      suffix: "/100",
      icon: Eye,
      detail: hasBaseline
        ? `${delta >= 0 ? "+" : ""}${n(delta, 1)} pts`
        : results.length
          ? "Baseline recorded"
          : "Your baseline awaits",
      foot: hasBaseline
        ? "latest audit vs. first in period"
        : "across selected answers",
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
  return (
    <div className="app-shell">
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
              <h1>{TITLES[view].title}</h1>
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
                  </div>
                )}
              </div>
              <button className="button primary" onClick={onRun}>
                <Plus size={16} /> Run an audit
              </button>
            </div>
          </div>
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
                      <span className={i === 0 && delta < 0 ? "negative" : ""}>
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
                <TrendChart
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
                        ? `${gaps.length} tracked prompts have answers that don’t mention ${project.brand}. Turn those blind spots into a useful content brief.`
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
                      demoMode ? router.push("/login") : setDiscoveryOpen(true)
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
              <TrendChart
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
          {view === "citations" && (
            <>
              <div className="citation-summary">
                <div>
                  <span className="eyebrow">THE SOURCE OF THE STORY</span>
                  <h2>{n(sources.length)} sources. A world of influence.</h2>
                  <p>
                    These are the websites AI refers to when answering your
                    tracked questions.
                  </p>
                </div>
                <div>
                  <strong>{n(citations)}</strong>
                  <span>total citations</span>
                </div>
                <div>
                  <strong>
                    {results.length
                      ? n((ownCitations / results.length) * 100, 1)
                      : 0}
                    %
                  </strong>
                  <span>cite your domain</span>
                </div>
              </div>
              <section className="panel table-panel">
                <table>
                  <thead>
                    <tr>
                      <th>SOURCE DOMAIN</th>
                      <th>ANSWERS CITING</th>
                      <th>COVERAGE</th>
                      <th>ENGINES</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {sources.map((s) => (
                      <tr key={s.domain}>
                        <td>
                          <div className="source-domain">
                            <span className="source-icon">
                              <Globe2 size={17} />
                            </span>
                            <div>
                              <strong>{s.domain}</strong>
                              <small>
                                {s.domain === normalizeDomain(project.domain)
                                  ? "YOUR DOMAIN"
                                  : "CITED SOURCE"}
                              </small>
                            </div>
                          </div>
                        </td>
                        <td>
                          {s.answerCount}
                          <span className="muted"> / {results.length}</span>
                        </td>
                        <td>
                          <div className="table-score">
                            <span className="table-score-track">
                              <i style={{ width: `${s.share}%` }} />
                            </span>
                            <b>{n(s.share, 1)}%</b>
                          </div>
                        </td>
                        <td>
                          <EngineStack engines={s.engines} />
                        </td>
                        <td>
                          <a
                            className="icon-button"
                            href={s.url}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`Open ${s.domain}`}
                          >
                            <ArrowUpRight size={16} />
                          </a>
                          <button
                            className="button source-research-button"
                            onClick={() =>
                              demoMode
                                ? router.push("/login")
                                : setResearchSource({
                                    url: s.url,
                                    domain: s.domain,
                                  })
                            }
                          >
                            <Search size={12} />
                            Research
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!sources.length && (
                  <Empty
                    title="Find out what AI is reading"
                    description="Cited sources will appear here after an audit."
                    onRun={onRun}
                  />
                )}
              </section>
              <div className="method-note">
                <ShieldCheck size={15} />
                <p>
                  Coverage is the percentage of successful answers that cite a
                  source. Citation frequency is evidence of visibility; it does
                  not prove endorsement, page strength, or factual accuracy.
                </p>
              </div>
            </>
          )}
          {view === "opportunities" && (
            <>
              <div className="opportunity-banner">
                <span className="intro-icon">
                  <Sparkles size={25} />
                </span>
                <div>
                  <span className="eyebrow">FROM INSIGHT TO ACTION</span>
                  <h2>A clearer path to being discovered.</h2>
                  <p>
                    Start with questions where AI mentions your competitors and
                    leaves you out.
                  </p>
                </div>
                <span className="outline-tag">
                  {gaps.filter((g) => !done.includes(g.prompt)).length} OPEN
                  MOVES
                </span>
              </div>
              <div className="opportunity-list">
                {gaps.map((g, i) => {
                  const complete = done.includes(g.prompt);
                  return (
                    <article
                      className={`panel opportunity-row ${complete ? "completed" : ""}`}
                      key={g.prompt}
                    >
                      <span className="opportunity-index">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <div className="opportunity-labels">
                          <span
                            className={`status-tag ${i < 3 ? "green" : "neutral"}`}
                          >
                            {complete
                              ? "COMPLETED"
                              : i < 3
                                ? "HIGH POTENTIAL"
                                : "CONTENT GAP"}
                          </span>
                          <span>
                            {n((g.misses / g.rows.length) * 100)}% of answers
                            miss your brand
                          </span>
                        </div>
                        <h3>{g.prompt}</h3>
                        <p>
                          {g.misses} of {g.rows.length} answers don’t mention{" "}
                          {project.brand}. Build a focused comparison or answer
                          page around this buyer question.
                        </p>
                        <div className="opportunity-engines">
                          <EngineStack
                            engines={[
                              ...new Set(
                                g.rows
                                  .filter((r) => !r.brandMentioned)
                                  .map((r) => r.engine),
                              ),
                            ]}
                          />
                          <span>Visibility score {n(g.score, 1)}/100</span>
                        </div>
                      </div>
                      <div className="opportunity-actions">
                        <button
                          className="button"
                          onClick={() => setBrief(g.prompt)}
                        >
                          <FileText size={14} /> Create brief{" "}
                          <ArrowUpRight size={13} />
                        </button>
                        <button
                          className="text-button muted"
                          onClick={() =>
                            setDone((old) =>
                              complete
                                ? old.filter((v) => v !== g.prompt)
                                : [...old, g.prompt],
                            )
                          }
                        >
                          {complete ? (
                            <CheckCheck size={14} />
                          ) : (
                            <Check size={14} />
                          )}{" "}
                          {complete ? "Reopen" : "Mark done"}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
              {!gaps.length && (
                <Empty
                  title={
                    results.length
                      ? "You’re in every tracked conversation."
                      : "Your next opportunity is waiting."
                  }
                  description={
                    results.length
                      ? "Add more buyer questions to discover new opportunities."
                      : "Run an audit to find where your brand could be showing up."
                  }
                  onRun={onRun}
                />
              )}
              <div className="method-note">
                <Lightbulb size={15} />
                <p>
                  Opportunities are ranked by the proportion of answers missing
                  your brand. Briefs are editable writing templates, based on
                  your audit. Nothing is published or sent automatically.
                </p>
              </div>
            </>
          )}
          {view === "history" && (
            <>
              <div className="section-toolbar">
                <div>
                  <h2>{demo ? "Example audit history" : "Your audit trail"}</h2>
                  <span className="outline-tag">{allRuns.length} RUNS</span>
                </div>
                <span className="muted">
                  Stored in this browser · export to keep a backup
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
                  tracked brands. Failed engines are excluded. The trend uses
                  actual saved audit dates. Demo data is always labeled.
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
      <AuditDialog
        open={auditOpen}
        onClose={() => setAuditOpen(false)}
        onComplete={finish}
        project={project}
        initialPrompts={auditPrompts || prompts.slice(0, 8)}
        token={token}
      />
      <DiscoveryDialog
        open={discoveryOpen}
        onClose={() => setDiscoveryOpen(false)}
        brand={project.brand}
        token={token}
        onAdd={(newPrompts) => {
          setPrompts((old) => [...new Set([...old, ...newPrompts])]);
          setToast(`${newPrompts.length} discovered prompts added.`);
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
          {answerContent(selectedRun.results)}
        </Modal>
      )}
      {brief && (
        <Modal
          title="Give your next page a head start."
          onClose={() => setBrief(null)}
          wide
        >
          <span className="status-tag green">WRITING BRIEF · TEMPLATE</span>
          <div className="writing-brief">
            <span className="eyebrow">THE BUYER QUESTION</span>
            <h3>{brief}</h3>
            <h4>Your opening</h4>
            <p>
              Answer the question directly in the first two sentences. Explain
              who {project.brand} is for and when it fits. Use only verified
              product details.
            </p>
            <h4>What to cover</h4>
            <ul>
              <li>
                Compare {project.brand} with {project.competitors.join(", ")}{" "}
                using clear, verifiable criteria.
              </li>
              <li>
                Include a concise comparison table covering features, pricing,
                and ideal use cases.
              </li>
              <li>
                Link to original sources and support every claim with evidence.
              </li>
              <li>
                Add specific answers to the follow-up questions a buyer would
                ask.
              </li>
            </ul>
            <h4>Before you publish</h4>
            <p>
              Verify facts, include the date of your review, and disclose your
              relationship to {project.brand}. Check that search engines can
              access the page. Run the same prompts again in 3–4 weeks.
            </p>
            <div className="brief-evidence">
              <ShieldCheck size={16} />
              <span>
                Based on a measured visibility gap. This is a writing template,
                not an AI-generated factual article.
              </span>
            </div>
          </div>
          <div className="modal-actions">
            <button className="button" onClick={() => setBrief(null)}>
              Close
            </button>
            <button
              className="button primary"
              onClick={() =>
                copy(
                  `Writing brief: ${brief}\n\nBrand: ${project.brand}\nCompare with: ${project.competitors.join(", ")}\n\nAnswer the buyer question in the first two sentences. Include a fact-checked comparison table, cite original sources, and add buyer FAQs. Verify pricing and features. Disclose your relationship to the brand. Recheck these prompts in 3–4 weeks.`,
                )
              }
            >
              <Copy size={14} /> Copy brief
            </button>
          </div>
        </Modal>
      )}
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
              guide are included in this project. Your audit data stays in your
              browser; Treg API calls run through your server.
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
      {toast && (
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
  );
}
