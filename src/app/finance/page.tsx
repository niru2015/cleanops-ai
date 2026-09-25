import { AppShell } from "@/components/app-shell";
import { FinanceWorkspace } from "@/components/finance-workspace";
import { FinanceSummary } from "@/components/finance-summary";
import { MessageContextQueue } from "@/components/message-context-queue";
import { CasinoSwitcher, FlowSteps, SectionTabs, StatusBadge } from "@/components/ui";
import { getFinanceSectionTabs } from "@/config/finance-navigation";
import { getFinanceWorkspace, type FinanceWorkspace as FinanceWorkspaceData } from "@/integrations/finance/supabase-finance";
import { getFinanceSummary, getPreferredFinanceMonth } from "@/integrations/finance/supabase-finance-summary";
import type { SiteFinanceSummary } from "@/services/finance-summary";
import { getMessageWorkspace, type MessageWorkspace } from "@/integrations/messages/supabase-message-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppAccessContext, resolveSelectedSite, type AppAccessContext, type AccessSite } from "@/services/access-context";
import { getFinanceSiteContext } from "@/services/finance-context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Loaded = {
  access: AppAccessContext;
  selectedSite: AccessSite | null;
  finance: FinanceWorkspaceData | null;
  messages: MessageWorkspace | null;
  summary: SiteFinanceSummary[];
  month: string;
  summarySiteId: string | null;
};

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ siteId?: string; month?: string }>;
}) {
  let loaded: Loaded | null = null;
  let loadError: "organization" | "unavailable" | null = null;
  try {
    const client = await createSupabaseServerClient();
    const access = await getAppAccessContext(client);
    const params = await searchParams;
    const selectedSite = resolveSelectedSite(access, params.siteId);
    const month = typeof params.month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month)
      ? params.month : await getPreferredFinanceMonth(client, access);
    const summarySiteId = params.siteId && params.siteId !== "all" ? selectedSite?.id ?? null : null;
    const context = access.canViewFinance && selectedSite ? getFinanceSiteContext(access, selectedSite.id) : null;
    const [finance, messages, summary] =
      context
        ? await Promise.all([
            getFinanceWorkspace(client, context),
            getMessageWorkspace(client, context),
            getFinanceSummary(client, access, month),
          ])
        : [null, null, []];
    loaded = { access, selectedSite, finance, messages, summary, month, summarySiteId };
  } catch (error) {
    if (error instanceof Error && error.message === "Organization selection required.") loadError = "organization";
    else if (!(error instanceof Error && error.message === "Authentication required.")) loadError = "unavailable";
  }

  if (!loaded) {
    return <AppShell currentPath="/finance"><section className="accessState"><p className="eyebrow">Finance &amp; inventory</p><h1>{loadError === "organization" ? "Organization selection required" : loadError === "unavailable" ? "Finance workspace unavailable" : "Sign in required"}</h1><p>{loadError === "organization" ? "This account belongs to more than one organization. Ask an administrator to select one before opening finance." : loadError === "unavailable" ? "The workspace could not be loaded. Please try again." : "Use a Director or Area Manager demo account."}</p>{loadError ? null : <a className="reviewButton reviewButton-primary" href="/login">Sign in</a>}</section></AppShell>;
  }

  const { access, selectedSite, finance, messages, summary, month, summarySiteId } = loaded;

  if (!access.canViewFinance) {
    return (
      <AppShell authenticated currentPath="/finance" role={access.role} roleLabel={access.roleLabel}>
        <section className="accessState">
          <p className="eyebrow">Finance &amp; inventory</p>
          <h1>Finance access restricted</h1>
          <p>Financial information is available only to Directors and the Area Manager responsible for the selected casino.</p>
        </section>
      </AppShell>
    );
  }

  if (!selectedSite || !finance || !messages) {
    return (
      <AppShell authenticated currentPath="/finance" role={access.role} roleLabel={access.roleLabel}>
        <section className="accessState">
          <p className="eyebrow">Finance &amp; inventory</p>
          <h1>No casino assignment</h1>
          <p>This account does not currently have access to a casino.</p>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell authenticated currentPath="/finance" role={access.role} roleLabel={access.roleLabel}>
      <section className="siteScopeBar" aria-label="Casino scope">
        <div>
          <p className="eyebrow">Casino scope</p>
          <strong>{selectedSite.name}{selectedSite.city ? ` · ${selectedSite.city}` : ""}</strong>
        </div>
        <form method="get">
          <input type="hidden" name="month" value={month} />
          <CasinoSwitcher name="siteId" sites={access.sites} selectedId={selectedSite.id} label="Choose casino" />
          <button className="ui-button ui-button-secondary" type="submit">Open casino</button>
        </form>
        <StatusBadge tone={access.canEditFinance ? "info" : "neutral"}>
          {access.canEditFinance ? "Director · edit" : "Area Manager · read only"}
        </StatusBadge>
      </section>
      <SectionTabs items={getFinanceSectionTabs(access.canEditFinance)} currentPath="/finance" ariaLabel="Finance sections" />
      <FlowSteps
        ariaLabel="How your finance data connects"
        steps={[
          { label: "Field messages come in", description: "Cleaners and supervisors send updates over WhatsApp while they work.", tone: "neutral" },
          { label: "You confirm what they mean", description: "A director links each message to the right site, task and person.", href: "#message-queue-title", tone: "info" },
          { label: "Costs and stock get logged", description: "Purchases, supplies and hours are recorded here — typed in, or matched from an accounting file.", href: "#inventory-ledger-title", tone: "pending" },
          { label: "Your numbers add up", description: "CleanOps works out revenue, costs and what's left over for each casino.", href: "/finance/reconciliation", tone: "success" },
        ]}
      />
      <FinanceSummary sites={summary} selectedSiteId={summarySiteId} month={month} />
      <p className="recordNote">Inventory, labour ledger and message context below are scoped to {selectedSite.name}.</p>
      <FinanceWorkspace workspace={finance} editable={access.canEditFinance} siteId={selectedSite.id} />
      <MessageContextQueue workspace={messages} />
    </AppShell>
  );
}
