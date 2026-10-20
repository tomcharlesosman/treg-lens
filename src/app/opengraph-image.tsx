import { renderCard } from "@/lib/og-card";

export const alt =
  "Treg Lens: your brand belongs in the answer. Open-source AI visibility across ChatGPT, Perplexity, Gemini and Google AI Mode.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return renderCard("home", size);
}
