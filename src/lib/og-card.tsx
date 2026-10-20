/* eslint-disable @next/next/no-img-element -- next/og renders plain <img> */
import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ReactNode } from "react";

// Shared Open Graph cards in the landing page's language: pixel type on the
// dotted canvas, an autofocus frame on one word, and a product vignette.
// Cards are prerendered at build time, so these reads never run per request.
const INK = "#1a1a1a";
const BODY = "#595959";
const MUTED = "#7c7c7c";
const GREEN = "#118453";
const AMBER = "#ba6603";
const ENGINES = [
  { id: "chatgpt", name: "ChatGPT", status: "#2" },
  { id: "perplexity", name: "Perplexity", status: "#1" },
  { id: "gemini", name: "Gemini", status: "Gap" },
  { id: "google", name: "AI Mode", status: "#3" },
];

// next/og reads TTF, OTF and WOFF, not the WOFF2 the pages use.
const font = readFile(join(process.cwd(), "src/app/fonts/geist-pixel-400.woff"));
const icons = Promise.all(
  ENGINES.map(async ({ id }) => {
    const svg = await readFile(join(process.cwd(), "public/engines", `${id}.svg`));
    return [id, `data:image/svg+xml;base64,${svg.toString("base64")}`] as const;
  }),
).then((entries) => Object.fromEntries(entries) as Record<string, string>);

const ARROW = `data:image/svg+xml;base64,${Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`,
).toString("base64")}`;

// next/og skips repeating CSS gradients, so the dotted canvas and the mint
// glow behind the vignette are one SVG layer.
const BACKDROP = `data:image/svg+xml;base64,${Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><defs><pattern id="d" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.6" fill="#000" fill-opacity="0.15"/></pattern><radialGradient id="f" cx="0.42" cy="0.45" r="0.75"><stop offset="0.25" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient><mask id="m"><rect width="1200" height="630" fill="url(#f)"/></mask><radialGradient id="g" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${GREEN}" stop-opacity="0.2"/><stop offset="1" stop-color="${GREEN}" stop-opacity="0"/></radialGradient></defs><rect width="1200" height="630" fill="url(#d)" mask="url(#m)"/><ellipse cx="920" cy="330" rx="420" ry="330" fill="url(#g)"/></svg>`,
).toString("base64")}`;

export type CardVariant = "home" | "login" | "demo";
const COPY: Record<
  CardVariant,
  { kicker: string; lines: [string, string]; focus: string }
> = {
  home: {
    kicker: "Open-source AI visibility",
    lines: ["Your brand", "belongs in the"],
    focus: "answer",
  },
  login: {
    kicker: "Sign in with your treg key",
    lines: ["One key.", "A whole new"],
    focus: "perspective",
  },
  demo: {
    kicker: "Sample workspace · illustrative data",
    lines: ["See the whole", "picture, in one"],
    focus: "workspace",
  },
};

function Mark({ size, light = false }: { size: number; light?: boolean }) {
  const cell = size * 0.274;
  return (
    <div
      style={{
        display: "flex",
        position: "relative",
        width: size,
        height: size,
        borderRadius: size * 0.22,
        background: light ? "#ffffff" : INK,
      }}
    >
      {[0.217, 0.509].map((offset) => (
        <div
          key={offset}
          style={{
            position: "absolute",
            left: size * offset,
            top: size * offset,
            width: cell,
            height: cell,
            borderRadius: cell * 0.14,
            background: light ? INK : "#ffffff",
          }}
        />
      ))}
    </div>
  );
}

function Focus({ children }: { children: ReactNode }) {
  const corner = { position: "absolute", width: 26, height: 26 } as const;
  const edge = `5px solid ${GREEN}`;
  return (
    <div style={{ display: "flex", position: "relative", padding: "0 16px" }}>
      {children}
      <div style={{ ...corner, left: 0, top: 6, borderTop: edge, borderLeft: edge }} />
      <div style={{ ...corner, right: 0, top: 6, borderTop: edge, borderRight: edge }} />
      <div style={{ ...corner, left: 0, bottom: 0, borderBottom: edge, borderLeft: edge }} />
      <div style={{ ...corner, right: 0, bottom: 0, borderBottom: edge, borderRight: edge }} />
    </div>
  );
}

const card = {
  display: "flex",
  flexDirection: "column",
  width: 430,
  borderRadius: 30,
  background: "#ffffff",
  border: "1px solid rgba(0,0,0,0.07)",
  boxShadow: "0 30px 60px -24px rgba(0,0,0,0.28)",
} as const;

function Bars({ widths }: { widths: (number | "you")[] }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 9 }}>
      {widths.map((w, i) => (
        <div
          key={i}
          style={{
            height: 13,
            width: w === "you" ? 96 : w,
            borderRadius: 7,
            background: w === "you" ? "#bfe6cf" : "#e4e4e4",
          }}
        />
      ))}
    </div>
  );
}

function AnswerVignette({ icon }: { icon: Record<string, string> }) {
  return (
    <div style={{ ...card, position: "relative", padding: 24, gap: 20 }}>
      <div
        style={{
          display: "flex",
          gap: 6,
          padding: 6,
          borderRadius: 14,
          background: "#f0f0f0",
        }}
      >
        {ENGINES.map(({ id }, i) => (
          <div
            key={id}
            style={{
              display: "flex",
              flex: 1,
              justifyContent: "center",
              padding: "8px 0",
              borderRadius: 10,
              background: i === 0 ? "#ffffff" : "transparent",
              opacity: i === 0 ? 1 : 0.45,
            }}
          >
            <img src={icon[id]} width={22} height={22} alt="" />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <div
          style={{
            display: "flex",
            padding: "10px 16px",
            borderRadius: "18px 18px 4px 18px",
            background: "#f0f0f0",
            fontSize: 18,
            color: INK,
          }}
        >
          best CRM for a 5-person team?
        </div>
      </div>
      <Bars widths={[150, 210, 120, 96, 170, "you", 130, 190, 110, 160, 140]} />
      <Bars widths={[200, 120, 180]} />
      {/* The lens */}
      <div
        style={{
          position: "absolute",
          left: 92,
          top: 130,
          width: 214,
          height: 214,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          borderRadius: 107,
          border: `11px solid ${INK}`,
          background: "#ffffff",
          boxShadow: "0 22px 40px -10px rgba(0,0,0,0.45)",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", fontSize: 21, color: BODY }}>three CRMs stand</div>
        <div
          style={{
            display: "flex",
            padding: "2px 10px",
            borderRadius: 8,
            background: "#d9f2e4",
            fontSize: 30,
            color: "#0b5e3a",
          }}
        >
          Your brand
        </div>
        <div style={{ display: "flex", fontSize: 21, color: BODY }}>is praised for</div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 262,
          top: 318,
          display: "flex",
          padding: "7px 12px",
          borderRadius: 9,
          background: INK,
          color: "#ffffff",
          fontSize: 17,
          letterSpacing: 1,
        }}
      >
        YOU · #2
      </div>
    </div>
  );
}

function KeyVignette() {
  return (
    <div
      style={{
        ...card,
        padding: 30,
        gap: 18,
        background: "#111111",
        border: "1px solid #222222",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          fontSize: 17,
          letterSpacing: 3,
          color: "#a3a3a3",
        }}
      >
        YOUR TREG API KEY
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 74,
          padding: "0 12px 0 22px",
          borderRadius: 16,
          border: "1px solid #2b2b2b",
          background: "#1c1c1c",
          fontSize: 24,
          color: "#f5f5f5",
        }}
      >
        trg_live_••••••••••
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 50,
            height: 50,
            borderRadius: 12,
            background: "#ffffff",
          }}
        >
          <img src={ARROW} width={26} height={26} alt="" />
        </div>
      </div>
      <div
        style={{ display: "flex", justifyContent: "center", fontSize: 17, color: "#8f8f8f" }}
      >
        Verified free · encrypted session
      </div>
    </div>
  );
}

function ReadoutVignette({ icon }: { icon: Record<string, string> }) {
  return (
    <div style={{ ...card, padding: 28, gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, letterSpacing: 2 }}>
        <span style={{ color: MUTED }}>IN FOCUS</span>
        <span style={{ color: GREEN }}>SAMPLE DATA</span>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 14, margin: "6px 0 12px" }}>
        <div style={{ display: "flex", fontSize: 76, lineHeight: 1 }}>3/4</div>
        <div style={{ display: "flex", flexDirection: "column", fontSize: 19, color: BODY, paddingBottom: 6 }}>
          <span>engines</span>
          <span>recommend you</span>
        </div>
      </div>
      {ENGINES.map(({ id, name, status }, i) => {
        const gap = status === "Gap";
        return (
          <div
            key={id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "9px 12px",
              margin: "0 -12px",
              borderRadius: 12,
              background: i === 0 ? "#f0f0f0" : "transparent",
              fontSize: 20,
            }}
          >
            <img src={icon[id]} width={22} height={22} alt="" />
            <span style={{ flex: 1 }}>{name}</span>
            <span
              style={{
                padding: "3px 10px",
                borderRadius: 999,
                border: `1px solid ${gap ? "#f1dfc5" : "#cbe7d7"}`,
                background: gap ? "#fff7ec" : "#eef8f2",
                color: gap ? AMBER : GREEN,
                fontSize: 16,
              }}
            >
              {gap ? "not mentioned" : status}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export async function renderCard(variant: CardVariant, size: { width: number; height: number }) {
  const [data, icon] = await Promise.all([font, icons]);
  const copy = COPY[variant];
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          position: "relative",
          width: "100%",
          height: "100%",
          padding: "52px 64px 48px",
          background: "#f8f8f8",
          color: INK,
          fontFamily: "Geist Pixel",
        }}
      >
        <img
          src={BACKDROP}
          width={size.width}
          height={size.height}
          alt=""
          style={{ position: "absolute", left: 0, top: 0 }}
        />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 34 }}>
            <Mark size={46} />
            <span>treg</span>
            <span style={{ color: "#b0b0b0" }}>/</span>
            <span>lens</span>
          </div>
          <div style={{ display: "flex", fontSize: 18, letterSpacing: 2, color: MUTED }}>
            MIT · OPEN SOURCE
          </div>
        </div>

        <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                marginBottom: 22,
                fontSize: 19,
                letterSpacing: 2,
                color: MUTED,
              }}
            >
              {copy.kicker.toUpperCase()}
            </div>
            <div style={{ display: "flex", flexDirection: "column", fontSize: 74, lineHeight: 1.08 }}>
              <span>{copy.lines[0]}</span>
              <span>{copy.lines[1]}</span>
              <div style={{ display: "flex", marginLeft: -16 }}>
                <Focus>{copy.focus}</Focus>
                <span>.</span>
              </div>
            </div>
          </div>
          {variant === "home" && <AnswerVignette icon={icon} />}
          {variant === "login" && <KeyVignette />}
          {variant === "demo" && <ReadoutVignette icon={icon} />}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {ENGINES.map(({ id }) => (
              <div
                key={id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  background: "#ffffff",
                  border: "1px solid rgba(0,0,0,0.08)",
                }}
              >
                <img src={icon[id]} width={22} height={22} alt="" />
              </div>
            ))}
            <span style={{ marginLeft: 8, fontSize: 19, color: BODY }}>
              ChatGPT · Perplexity · Gemini · Google AI Mode
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 19, color: BODY }}>
            <Mark size={22} />
            powered by treg
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: "Geist Pixel", data, weight: 400, style: "normal" }],
    },
  );
}
