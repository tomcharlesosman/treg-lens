"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useRef } from "react";

const SRC = "/marketing/workspace.png";
const ZOOM = 2.2;

// The sample dashboard is dense; a loupe follows a fine pointer so visitors
// can read it without leaving the page.
export default function WorkspaceLoupe() {
  const frame = useRef<HTMLAnchorElement>(null);
  const move = (event: React.PointerEvent<HTMLAnchorElement>) => {
    const el = frame.current;
    if (!el || event.pointerType === "touch") return;
    const box = el.getBoundingClientRect();
    const x = event.clientX - box.left;
    const y = event.clientY - box.top;
    el.style.setProperty("--mx", `${x}px`);
    el.style.setProperty("--my", `${y}px`);
    el.style.setProperty("--bw", `${box.width * ZOOM}px`);
    el.style.setProperty("--bx", `${-x * ZOOM}px`);
    el.style.setProperty("--by", `${-y * ZOOM}px`);
    el.dataset.loupe = "on";
  };
  const leave = () => {
    if (frame.current) delete frame.current.dataset.loupe;
  };
  return (
    <Link
      href="/demo"
      ref={frame}
      className="ll-shot"
      aria-label="Preview sample data"
      onPointerMove={move}
      onPointerLeave={leave}
    >
      <img
        src={SRC}
        alt="Treg Lens demo showing visibility trends, engine comparisons, share of voice, and content opportunities"
        width={1440}
        height={1421}
        loading="lazy"
      />
      <span className="ll-loupe" aria-hidden="true" />
      <span className="ll-shot-cta">
        Open the sample workspace <ArrowUpRight size={15} />
      </span>
    </Link>
  );
}
