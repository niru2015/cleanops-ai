import "server-only";

import { isSiteAllowed, type AppAccessContext } from "@/services/access-context";

export type FinanceSiteContext = Readonly<{
  organizationId: string;
  siteId: string;
  actorUserId: string;
  canReadLabour: boolean;
}>;

export function getFinanceSiteContext(access: AppAccessContext, siteId: string): FinanceSiteContext {
  if (!access.canViewFinance || !isSiteAllowed(access, siteId)) {
    throw new Error("Finance access to this casino is required.");
  }
  return {
    organizationId: access.organizationId,
    siteId,
    actorUserId: access.userId,
    canReadLabour: access.canEditFinance,
  };
}
