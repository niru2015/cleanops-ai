import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppAccessContext } from "@/services/access-context";

const uuid=z.uuid();
const intakeSchema=z.object({id:uuid,site_id:uuid.nullable(),source_kind:z.string(),
  source_text:z.string(),proposed:z.record(z.string(),z.unknown()),
  extraction_state:z.string(),review_state:z.string(),created_at:z.string(),
  project_reference:z.string().nullable(),rejection_reason:z.string().nullable()});
const documentSchema=z.object({id:uuid,intake_id:uuid,status:z.string(),sha256:z.string().nullable(),
  storage_bucket:z.string(),detected_mime:z.string().nullable(),created_at:z.string()});
const claimSchema=z.object({id:uuid,intake_id:uuid,site_id:uuid,contract_id:uuid.nullable(),
  project_reference:z.string().nullable(),vendor:z.string(),expense_date:z.string(),
  payment_method:z.string(),currency:z.string(),subtotal:z.coerce.number().nullable(),
  tax:z.coerce.number().nullable(),total:z.coerce.number(),category:z.string(),
  status:z.string(),revision:z.number(),review_reason:z.string().nullable(),
  receipt_sha256:z.string().nullable(),asset_review_required:z.boolean(),
  reimbursement_status:z.string(),approved_by:uuid.nullable(),approved_at:z.string().nullable()});
const allocationSchema=z.object({id:uuid,claim_id:uuid,site_id:uuid,
  project_reference:z.string().nullable(),amount:z.coerce.number()});
const postingSchema=z.object({id:uuid,claim_id:uuid,allocation_id:uuid,site_id:uuid,
  category:z.string(),currency:z.string(),amount:z.coerce.number(),posted_at:z.string()});
const auditSchema=z.object({id:uuid,intake_id:uuid,claim_id:uuid.nullable(),event_kind:z.string(),
  reason:z.string().nullable(),actor_id:uuid.nullable(),created_at:z.string(),
  old_value:z.unknown(),new_value:z.unknown()});
export type ExpenseIntake=z.infer<typeof intakeSchema>;
export type ExpenseDocument=z.infer<typeof documentSchema>;
export type ExpenseClaim=z.infer<typeof claimSchema>;
export type ExpenseAllocation=z.infer<typeof allocationSchema>;
export type ExpensePosting=z.infer<typeof postingSchema>;
export type ExpenseAudit=z.infer<typeof auditSchema>;
function read<T>(result:{data:unknown;error:unknown},schema:z.ZodType<T>):T{
  if(result.error)throw new Error("Expense records could not be loaded.");
  return schema.parse(result.data);
}
export async function getExpenseWorkspace(client:SupabaseClient,access:AppAccessContext){
  if(!access.canViewFinance)throw new Error("Finance access required.");
  const [intakes,documents,claims,allocations,postings,audits]=await Promise.all([
    client.from("finance_intake_items").select("id,site_id,source_kind,source_text,proposed,extraction_state,review_state,created_at,project_reference,rejection_reason")
      .eq("organization_id",access.organizationId).order("created_at",{ascending:false}).limit(100),
    client.from("expense_documents").select("id,intake_id,status,sha256,storage_bucket,detected_mime,created_at")
      .eq("organization_id",access.organizationId).order("created_at",{ascending:false}).limit(150),
    client.from("expense_claims").select("id,intake_id,site_id,contract_id,project_reference,vendor,expense_date,payment_method,currency,subtotal,tax,total,category,status,revision,review_reason,receipt_sha256,asset_review_required,reimbursement_status,approved_by,approved_at")
      .eq("organization_id",access.organizationId).order("expense_date",{ascending:false}).limit(100),
    client.from("expense_allocations").select("id,claim_id,site_id,project_reference,amount")
      .eq("organization_id",access.organizationId).limit(200),
    client.from("expense_postings").select("id,claim_id,allocation_id,site_id,category,currency,amount,posted_at")
      .eq("organization_id",access.organizationId).order("posted_at",{ascending:false}).limit(200),
    client.from("expense_audit_events").select("id,intake_id,claim_id,event_kind,reason,actor_id,created_at,old_value,new_value")
      .eq("organization_id",access.organizationId).order("created_at",{ascending:false}).limit(200),
  ]);
  return {intakes:read(intakes,z.array(intakeSchema)),documents:read(documents,z.array(documentSchema)),
    claims:read(claims,z.array(claimSchema)),allocations:read(allocations,z.array(allocationSchema)),
    postings:read(postings,z.array(postingSchema)),audits:read(audits,z.array(auditSchema))};
}
