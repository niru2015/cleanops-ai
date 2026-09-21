import { AppShell } from "@/components/app-shell";
import { ReviewWorkspace } from "@/components/review-workspace";
import { getReviewWorkspace, type ReviewWorkspace as ReviewWorkspaceData } from "@/integrations/review/supabase-review";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppAccessContext } from "@/services/access-context";
import { DEMO_SITE_ID } from "@/services/operations-runtime";
import { DEMO_REVIEW_TASK_ID, getReviewRuntime } from "@/services/review-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function ReviewPage() {
  try {
    const client = await createSupabaseServerClient();
    const access = await getAppAccessContext(client);
    if (!access.canReviewEvidence) {
      return <AppShell authenticated currentPath="/review" role={access.role} roleLabel={access.roleLabel}><section className="accessState"><p className="eyebrow">Evidence review</p><h1>Review access restricted</h1><p>This role cannot review casino evidence.</p></section></AppShell>;
    }
    const hasFixtureSite = access.role === "organization_administrator" || access.sites.some((site) => site.id === DEMO_SITE_ID);
    if (!hasFixtureSite) {
      return <AppShell authenticated currentPath="/review" role={access.role} roleLabel={access.roleLabel}><section className="accessState"><p className="eyebrow">Evidence review</p><h1>No review fixture for assigned casinos</h1><p>The current review walkthrough is seeded only at Grand Villa Casino.</p></section></AppShell>;
    }
    const runtime = await getReviewRuntime();
    const workspace: ReviewWorkspaceData = await getReviewWorkspace(runtime.accessClient, DEMO_REVIEW_TASK_ID);
    return <AppShell authenticated currentPath="/review" role={access.role} roleLabel={access.roleLabel}><ReviewWorkspace workspace={workspace} demo={runtime.demo} /></AppShell>;
  } catch {
    return <AppShell currentPath="/review"><div className="reviewWorkspace"><header className="reviewHeader"><div><p className="reviewContext">Evidence review</p><h1>Sign in required</h1><p className="reviewLead">Use an authorized CleanOps demo account.</p><a className="reviewButton reviewButton-primary" href="/login">Sign in</a></div></header></div></AppShell>;
  }
}
