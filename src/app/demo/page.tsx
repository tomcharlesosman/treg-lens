import Workspace from "@/components/workspace";
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Explore the demo — Treg Lens",
  description: "Explore an illustrative Treg Lens workspace. No key needed.",
};
export default function DemoPage() {
  return <Workspace demoMode />;
}
