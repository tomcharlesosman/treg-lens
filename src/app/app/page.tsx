import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import Workspace from "@/components/workspace";
import { getTregSession } from "@/lib/treg-auth";
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Your workspace — Treg Lens",
  robots: { index: false, follow: false },
};
async function AuthenticatedWorkspace() {
  // Session decryption checks the current time. Keep it out of speculative
  // prerendering and only authenticate after the actual request arrives.
  await connection();
  const session = await getTregSession();
  if (!session) redirect("/login");
  return <Workspace key={session.workspaceId} storageId={session.workspaceId} />;
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
