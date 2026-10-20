import { renderCard } from "@/lib/og-card";

export const alt =
  "Treg Lens sample workspace with illustrative visibility data across four answer engines.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return renderCard("demo", size);
}
