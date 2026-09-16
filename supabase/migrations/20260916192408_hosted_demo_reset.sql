-- Reset only the shared Aurora Downtown synthetic walkthrough. The function is
-- intentionally service-role only; the application performs the authenticated
-- supervisor and site-grant check before using its server-side secret client.
grant delete on table
  public.quality_ai_runs,
  public.quality_ai_evaluations,
  public.corrective_actions,
  public.quality_findings,
  public.inspections,
  public.quality_decisions,
  public.review_audit_events,
  public.reporting_audit_events,
  public.client_service_reports,
  public.equipment_reports,
  public.incidents,
  public.evidence_pairs,
  public.task_evidence,
  public.conversation_contexts,
  public.integration_webhook_events,
  public.replacement_selections,
  public.shift_assignments
to service_role;
grant update on table public.task_runs to service_role;

create function public.reset_hosted_demo()
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

revoke execute on function public.reset_hosted_demo() from public, anon, authenticated;
grant execute on function public.reset_hosted_demo() to service_role;
