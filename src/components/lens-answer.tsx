"use client";
/* eslint-disable @next/next/no-img-element */
import { Fragment, useEffect, useRef, useState } from "react";

// Illustrative answers about fictional brands. The lens roams between the
// marked phrases; a fine pointer can steer it instead. "\n" starts a paragraph.
type Mark =
  | { kind: "you" | "rival"; text: string; focus?: string }
  | { kind: "cite"; n: number; focus?: string }
  | { kind: "gap"; focus: string };
type Engine = {
  id: string;
  name: string;
  status: string;
  sources: string[];
  answer: (string | Mark)[];
};

const PROMPT = "What’s the best CRM for a five-person sales team?";
const ENGINES: Engine[] = [
  {
    id: "chatgpt",
    name: "ChatGPT",
    status: "#2",
    sources: ["capterra.com", "g2.com", "reddit.com"],
    answer: [
      "For a five-person team, three CRMs come up most. ",
      { kind: "rival", text: "Northwind", focus: "Rival · #1" },
      " is the familiar default, with a generous free tier",
      { kind: "cite", n: 1 },
      ". ",
      { kind: "you", text: "Your brand", focus: "You · #2" },
      " is praised for email tracking and a setup measured in minutes",
      { kind: "cite", n: 2, focus: "Source · g2.com" },
      ". ",
      { kind: "rival", text: "Contoso" },
      " suits teams that still live in spreadsheets",
      { kind: "cite", n: 3 },
      ".",
      "\n",
      "Quick pick: ",
      { kind: "rival", text: "Northwind" },
      " for reporting depth, ",
      { kind: "you", text: "Your brand" },
      " if you want the team selling by Friday.",
    ],
  },
  {
    id: "perplexity",
    name: "Perplexity",
    status: "#1",
    sources: ["reddit.com", "yourbrand.com", "g2.com", "capterra.com"],
    answer: [
      { kind: "you", text: "Your brand", focus: "You · #1" },
      " is the most recommended option for small sales teams, thanks to its simple pipeline view",
      { kind: "cite", n: 1, focus: "Source · reddit.com" },
      { kind: "cite", n: 2 },
      ". ",
      { kind: "rival", text: "Northwind", focus: "Rival · #2" },
      " offers deeper reporting at a higher price",
      { kind: "cite", n: 3 },
      ", and ",
      { kind: "rival", text: "Fabrikam" },
      " fits teams already using its help desk",
      { kind: "cite", n: 4 },
      ".",
      "\n",
      "Most small-team threads land on the same shortlist, with ",
      { kind: "you", text: "Your brand" },
      " named first for ease of use.",
    ],
  },
  {
    id: "gemini",
    name: "Gemini",
    status: "Gap",
    sources: ["capterra.com", "g2.com", "reddit.com"],
    answer: [
      "Popular choices include ",
      { kind: "rival", text: "Northwind", focus: "Rival · #1" },
      ", ",
      { kind: "rival", text: "Contoso" },
      " and ",
      { kind: "rival", text: "Fabrikam" },
      " ",
      { kind: "gap", focus: "You · not mentioned" },
      ". Northwind balances price and features",
      { kind: "cite", n: 1, focus: "Source · capterra.com" },
      "; Contoso is easy to customize",
      { kind: "cite", n: 2 },
      ". For very small teams, Fabrikam’s free plan is a reasonable start",
      { kind: "cite", n: 3 },
      ".",
      "\n",
      "Compare free-plan limits and integrations before you commit; most teams outgrow spreadsheets within a year.",
    ],
  },
  {
    id: "google",
    name: "AI Mode",
    status: "#3",
    sources: ["g2.com", "capterra.com", "yourbrand.com"],
    answer: [
      "Based on reviews and pricing pages, the top options are ",
      { kind: "rival", text: "Northwind", focus: "Rival · #1" },
      { kind: "cite", n: 1 },
      ", ",
      { kind: "rival", text: "Contoso" },
      { kind: "cite", n: 2 },
      " and ",
      { kind: "you", text: "Your brand", focus: "You · #3" },
      { kind: "cite", n: 3, focus: "Source · yourbrand.com" },
      ". Reviewers single out its clean mobile app and transparent pricing.",
      "\n",
      "All three start free; paid plans differ mostly in automation and seats",
      { kind: "cite", n: 2 },
      ".",
    ],
  },
];

const DWELL_MS = 1500;
const easeInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

function Answer({ engine, sharp }: { engine: Engine; sharp: boolean }) {
  const paragraphs: { part: string | Mark; index: number }[][] = [[]];
  engine.answer.forEach((part, index) => {
    if (part === "\n") paragraphs.push([]);
    else paragraphs[paragraphs.length - 1].push({ part, index });
  });
  return paragraphs.map((paragraph, p) => (
    <p key={p}>
      {paragraph.map(({ part, index }) => {
        if (typeof part === "string")
          return <Fragment key={index}>{part}</Fragment>;
        const focus = sharp ? undefined : part.focus;
        if (part.kind === "cite")
          return (
            <sup key={index} className="lla-cite" data-focus={focus}>
              {part.n}
            </sup>
          );
        if (part.kind === "gap")
          return (
            <span key={index} className="lla-gap" data-focus={focus}>
              your brand?
            </span>
          );
        return (
          <span key={index} className={`lla-${part.kind}`} data-focus={focus}>
            {part.text}
          </span>
        );
      })}
    </p>
  ));
}

export default function LensAnswer() {
  const [active, setActive] = useState(0);
  const [tag, setTag] = useState("");
  const pinned = useRef(false);
  const lens = useRef<{ x: number; y: number } | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const blurLayer = useRef<HTMLDivElement>(null);
  const engine = ENGINES[active];

  useEffect(() => {
    const root = body.current;
    const layer = blurLayer.current;
    if (!root || !layer) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let points: { x: number; y: number; label: string }[] = [];
    // Keep the lens where it was when the engine changes.
    let pos = lens.current ?? {
      x: root.clientWidth * 0.5,
      y: root.clientHeight * 0.45,
    };
    let from = pos;
    let to = pos;
    let start = 0;
    let duration = 1;
    let index = -1;
    let arrivedAt = 0;
    let pointer: { x: number; y: number } | null = null;
    let frame = 0;
    let visible = true;
    // null forces the first update, clearing a tag left by the previous engine.
    let shownTag: string | null = null;
    let last = performance.now();

    const measure = () => {
      const box = root.getBoundingClientRect();
      // Keep the barrel inside the answer even when a mark starts a line.
      const edge =
        0.85 * (parseFloat(getComputedStyle(root).getPropertyValue("--lr")) || 0);
      points = [...layer.querySelectorAll<HTMLElement>("[data-focus]")].map(
        (el) => {
          const rect = el.getClientRects()[0] ?? el.getBoundingClientRect();
          const x = rect.left - box.left + rect.width / 2;
          return {
            x: Math.min(Math.max(x, edge), Math.max(edge, box.width - edge)),
            y: rect.top - box.top + rect.height / 2,
            label: el.dataset.focus ?? "",
          };
        },
      );
    };
    const paint = () => {
      lens.current = pos;
      root.style.setProperty("--lx", `${pos.x}px`);
      root.style.setProperty("--ly", `${pos.y}px`);
      // Hang the tag on whichever side has room.
      const side = pos.x > root.clientWidth * 0.6 ? "left" : "right";
      if (root.dataset.tag !== side) root.dataset.tag = side;
    };
    const showTag = (label: string) => {
      if (label === shownTag) return;
      shownTag = label;
      setTag(label);
    };
    const nearest = () => {
      const radius = 46;
      let best = "";
      let distance = radius;
      for (const p of points) {
        const d = Math.hypot(p.x - pos.x, p.y - pos.y);
        if (d < distance) [best, distance] = [p.label, d];
      }
      return best;
    };
    const travelTo = (next: number, now: number) => {
      index = next;
      from = pos;
      to = points[index];
      start = now;
      duration = Math.min(
        1100,
        Math.max(520, Math.hypot(to.x - from.x, to.y - from.y) * 2.2),
      );
      arrivedAt = 0;
      showTag("");
    };

    measure();
    if (reduced) {
      const you = points.find((p) => p.label.startsWith("You")) ?? points[0];
      if (you) pos = { x: you.x, y: you.y };
      paint();
      showTag(nearest());
    }

    const tick = (now: number) => {
      frame = 0;
      const dt = Math.min(64, now - last);
      last = now;
      if (pointer) {
        const k = reduced ? 1 : 1 - Math.exp(-dt / 70);
        pos = {
          x: pos.x + (pointer.x - pos.x) * k,
          y: pos.y + (pointer.y - pos.y) * k,
        };
        showTag(nearest());
      } else if (!reduced && points.length) {
        if (index < 0) travelTo(0, now);
        const t = Math.min(1, (now - start) / duration);
        const e = easeInOut(t);
        pos = {
          x: from.x + (to.x - from.x) * e,
          y: from.y + (to.y - from.y) * e,
        };
        if (t === 1) {
          if (!arrivedAt) {
            arrivedAt = now;
            showTag(nearest());
          } else if (now - arrivedAt > DWELL_MS) {
            if (index + 1 < points.length) travelTo(index + 1, now);
            else if (!pinned.current) {
              setActive((value) => (value + 1) % ENGINES.length);
              arrivedAt = Infinity; // wait for the new answer to remeasure
            } else travelTo(0, now);
          }
        }
      }
      paint();
      if (visible && (pointer || !reduced)) frame = requestAnimationFrame(tick);
    };
    const run = () => {
      if (!frame && visible) {
        last = performance.now();
        frame = requestAnimationFrame(tick);
      }
    };
    const onMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const box = root.getBoundingClientRect();
      pointer = { x: event.clientX - box.left, y: event.clientY - box.top };
      run();
    };
    const onLeave = () => {
      pointer = null;
      if (reduced) return;
      // Resume the tour from wherever the visitor left the lens.
      let closest = 0;
      points.forEach((p, i) => {
        if (
          Math.hypot(p.x - pos.x, p.y - pos.y) <
          Math.hypot(points[closest].x - pos.x, points[closest].y - pos.y)
        )
          closest = i;
      });
      if (points.length) travelTo(closest, performance.now());
      run();
    };
    const remeasure = () => {
      measure();
      if (index >= 0 && points[index]) {
        pos = to = from = points[index];
        paint();
      }
    };
    const resize = new ResizeObserver(remeasure);
    // Late web fonts can shift words without resizing the answer.
    let disposed = false;
    document.fonts?.ready.then(() => {
      if (!disposed) remeasure();
    });
    const seen = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) run();
      else if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    });
    resize.observe(root);
    seen.observe(root);
    root.addEventListener("pointermove", onMove);
    root.addEventListener("pointerleave", onLeave);
    run();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resize.disconnect();
      seen.disconnect();
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerleave", onLeave);
    };
  }, [active]);

  const choose = (next: number) => {
    pinned.current = true;
    setActive(next);
  };

  return (
    <div className="lla">
      <div className="lla-answer">
        <div
          className="lla-tabs"
          role="group"
          aria-label="Choose an answer engine"
        >
          {ENGINES.map((item, index) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={index === active}
              onClick={() => choose(index)}
            >
              <img src={`/engines/${item.id}.svg`} alt="" width={16} height={16} />
              <span>{item.name}</span>
            </button>
          ))}
        </div>
        <div className="lla-prompt">
          <span>{PROMPT}</span>
        </div>
        <div className="lla-reply">
          <span className="lla-avatar" aria-hidden="true">
            <img src={`/engines/${engine.id}.svg`} alt="" width={18} height={18} />
          </span>
          <div className="lla-body" ref={body}>
            <div className="lla-layer lla-blurred" ref={blurLayer} aria-hidden="true">
              <Answer engine={engine} sharp={false} />
            </div>
            <div className="lla-screen" aria-hidden="true" />
            <div className="lla-layer lla-sharp">
              <Answer engine={engine} sharp />
            </div>
            <div className="lla-lens" aria-hidden="true">
              <span className={`lla-tag ${tag ? "is-on" : ""}`}>{tag}</span>
            </div>
          </div>
        </div>
        <div className="lla-sources">
          <span>Sources</span>
          <ol>
            {engine.sources.map((source) => (
              <li
                key={source}
                className={source === "yourbrand.com" ? "is-you" : ""}
              >
                {source}
              </li>
            ))}
          </ol>
        </div>
      </div>
      <aside className="lla-readout" aria-label="Illustrative visibility readout">
        <header>
          <span>In focus</span>
          <span>Your brand</span>
        </header>
        <div className="lla-score">
          <strong>3/4</strong>
          <span>engines recommend you</span>
        </div>
        <ul>
          {ENGINES.map((item, index) => (
            <li
              key={item.id}
              className={index === active ? "is-active" : ""}
            >
              <img src={`/engines/${item.id}.svg`} alt="" width={16} height={16} />
              <span>{item.name}</span>
              <em className={item.status === "Gap" ? "is-gap" : ""}>
                {item.status === "Gap" ? "Not mentioned" : item.status}
              </em>
              <small>{item.sources.length} sources</small>
            </li>
          ))}
        </ul>
        <footer>
          <span className="lla-next">Next move</span>
          <p>Gemini cites capterra.com and leaves you out. Start a brief there.</p>
        </footer>
      </aside>
    </div>
  );
}
