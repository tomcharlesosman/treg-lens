import { Suspense } from "react";
import { redirect } from "next/navigation";
import Workspace from "@/components/workspace";
import { getTregSession } from "@/lib/treg-auth";
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Your workspace — Treg Lens",
  robots: { index: false, follow: false },
};
async function AuthenticatedWorkspace() {
  const session = await getTregSession();
  if (!session) redirect("/login");
  return <Workspace storageId={session.workspaceId} />;
}
export default function AppPage() {
  return (
    <Suspense
      fallback={
        <div className="workspace-loading" role="status">
          <span className="brand-mark">
            <span />
            <span />
          </span>
          <p>Bringing your workspace into focus…</p>
        </div>
      }
    >
      <AuthenticatedWorkspace />
    </Suspense>
  );
}
