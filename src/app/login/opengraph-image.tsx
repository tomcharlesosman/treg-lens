import { renderCard } from "@/lib/og-card";

export const alt =
  "Sign in to Treg Lens with your treg API key: one key, a whole new perspective.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return renderCard("login", size);
}
