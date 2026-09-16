import { AppShell } from "@/components/app-shell";
import { ReviewWorkspace } from "@/components/review-workspace";
import { getReviewWorkspace, type ReviewWorkspace as ReviewWorkspaceData } from "@/integrations/review/supabase-review";
import { DEMO_REVIEW_TASK_ID, getReviewRuntime } from "@/services/review-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function ReviewPage() {
  let loaded: { workspace: ReviewWorkspaceData; demo: boolean } | null = null;
  try {
    const runtime = await getReviewRuntime();
    loaded = { workspace: await getReviewWorkspace(runtime.accessClient, DEMO_REVIEW_TASK_ID), demo: runtime.demo };
  } catch {}

  if (loaded) {
    return <AppShell authenticated currentPath="/review"><ReviewWorkspace workspace={loaded.workspace} demo={loaded.demo} /></AppShell>;
  }

  return (
    <AppShell currentPath="/review">
      <div className="reviewWorkspace">
        <header className="reviewHeader"><div><p className="reviewContext">Evidence review</p><h1>Supervisor access required</h1><p className="reviewLead">Sign in with the hosted demo supervisor account.</p><a className="reviewButton reviewButton-primary" href="/login">Sign in</a></div></header>
      </div>
    </AppShell>
  );
}
