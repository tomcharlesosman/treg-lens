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
async function AuthenticatedWorkspace({ searchParams }: PageProps<"/app">) {
  // Session decryption checks the current time. Keep it out of speculative
  // prerendering and only authenticate after the actual request arrives.
  await connection();
  const session = await getTregSession();
  if (!session) redirect("/login");
  const reviewOnboarding = (await searchParams).setup === "review";
  return <Workspace key={session.workspaceId} storageId={session.workspaceId} reviewOnboarding={reviewOnboarding} />;
}
export default function AppPage(props: PageProps<"/app">) {
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
      <AuthenticatedWorkspace {...props} />
    </Suspense>
  );
}
