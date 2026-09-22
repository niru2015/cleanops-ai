-- CLEAN-012 follow-up: reset_hosted_demo predates the CLEAN-027/CLEAN-020 finance
-- ledgers and did not clear them, so a Director's demo inventory/labour entries
-- survived a reset. Extend the same site-scoped reset to cover both ledgers.
--
-- equipment_assets is deliberately NOT added here: it is seeded fixture data with
-- no application write path today (only `select` is granted to `authenticated`), so
-- there is nothing for a demo to mutate there yet. Deleting those rows on reset would
-- remove the equipment portfolio until a full `supabase db reset`, which would be a
-- regression, not a fix.

create or replace function public.reset_hosted_demo()
returns table (storage_path text)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return query
    select evidence.storage_path
    from public.task_evidence as evidence
    where evidence.organization_id = '10000000-0000-4000-8000-000000000001'
      and evidence.site_id = '40000000-0000-4000-8000-000000000001';

  delete from public.quality_ai_evaluations
   where organization_id = '10000000-0000-4000-8000-000000000001'
     and quality_ai_run_id in (
       select id from public.quality_ai_runs
        where organization_id = '10000000-0000-4000-8000-000000000001'
          and site_id = '40000000-0000-4000-8000-000000000001'
     );
  delete from public.quality_ai_runs
   where organization_id = '10000000-0000-4000-8000-000000000001'
     and site_id = '40000000-0000-4000-8000-000000000001';
  delete from public.corrective_actions
   where organization_id = '10000000-0000-4000-8000-000000000001'
     and site_id = '40000000-0000-4000-8000-000000000001';
  delete from public.quality_findings
   where organization_id = '10000000-0000-4000-8000-000000000001'
     and site_id = '40000000-0000-4000-8000-000000000001';
  delete from public.inspections
   where organization_id = '10000000-0000-4000-8000-000000000001'
     and site_id = '40000000-0000-4000-8000-000000000001';
  delete from public.quality_decisions
   where organization_id = '10000000-0000-4000-8000-000000000001'
     and site_id = '40000000-0000-4000-8000-000000000001';
  delete from public.review_audit_events
   where organization_id = '10000000-0000-4000-8000-000000000001'
     and site_id = '40000000-0000-4000-8000-000000000001';

  delete from public.reporting_audit_events
   where organization_id = '10000000-0000-4000-8000-000000000001'
     and site_id = '40000000-0000-4000-8000-000000000001';
  delete from public.client_service_reports
   where organization_id = '10000000-0000-4000-8000-000000000001'
     and site_id = '40000000-0000-4000-8000-000000000001';
  delete from public.equipment_reports
   where organization_id = '10000000-0000-4000-8000-000000000001'
     and site_id = '40000000-0000-4000-8000-000000000001';
  delete from public.incidents
   where organization_id = '10000000-0000-4000-8000-000000000001'
     and site_id = '40000000-0000-4000-8000-000000000001';

  -- CLEAN-012 follow-up: clear demo-entered finance ledger rows for this site.
  delete from public.inventory_transactions
   where organization_id = '10000000-0000-4000-8000-000000000001'
     and site_id = '40000000-0000-4000-8000-000000000001';
  delete from public.labor_cost_entries
   where organization_id = '10000000-0000-4000-8000-000000000001'
     and site_id = '40000000-0000-4000-8000-000000000001';

  delete from public.evidence_pairs
   where organization_id = '10000000-0000-4000-8000-000000000001'
     and site_id = '40000000-0000-4000-8000-000000000001';
  delete from public.task_evidence
   where organization_id = '10000000-0000-4000-8000-000000000001'
     and site_id = '40000000-0000-4000-8000-000000000001';

  delete from public.conversation_contexts
   where organization_id = '10000000-0000-4000-8000-000000000001'
     and external_thread_id = 'cleanops-mobile-demo';
  delete from public.integration_webhook_events
   where organization_id = '10000000-0000-4000-8000-000000000001'
     and integration_account_id = 'c0000000-0000-4000-8000-000000000001';

  delete from public.replacement_selections
   where organization_id = '10000000-0000-4000-8000-000000000001'
     and site_id = '40000000-0000-4000-8000-000000000001'
     and shift_id = '90000000-0000-4000-8000-000000000001';
  delete from public.shift_assignments
   where organization_id = '10000000-0000-4000-8000-000000000001'
     and site_id = '40000000-0000-4000-8000-000000000001'
     and shift_id = '90000000-0000-4000-8000-000000000001'
     and worker_id in (
       '62000000-0000-4000-8000-000000000041',
       '62000000-0000-4000-8000-000000000042'
     );

  update public.task_runs
     set state = 'ready', submission_revision = 0, updated_at = now()
   where id in (
     '81000000-0000-4000-8000-000000000001',
     '81000000-0000-4000-8000-000000000004'
   )
     and organization_id = '10000000-0000-4000-8000-000000000001'
     and site_id = '40000000-0000-4000-8000-000000000001';
end;
$$;

-- service_role already holds ALL on inventory_transactions and labor_cost_entries
-- (granted in 20260921002737_normalized_message_finance_records.sql), and this
-- function is service_role-only (security invoker; execute is restricted below as
-- it already was), so no new grants are required.
revoke execute on function public.reset_hosted_demo() from public, anon, authenticated;
grant execute on function public.reset_hosted_demo() to service_role;
