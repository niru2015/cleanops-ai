-- CLEAN-013: preserve who authenticated the upload separately from the worker
-- to whom the operational evidence is attributed.
alter table public.task_evidence
  add column submitted_by_user_id uuid references auth.users(id) on delete set null;

create index task_evidence_submitted_by_user_idx
  on public.task_evidence (submitted_by_user_id)
  where submitted_by_user_id is not null;

insert into public.task_run_assignments
  (id, organization_id, site_id, task_run_id, worker_id, assigned_by, assigned_at)
select 'b1000000-0000-4000-8000-000000000002',
  run.organization_id, run.site_id, run.id, worker.id, null,
  '2026-09-14T05:50:00Z'
from public.task_runs as run
join public.workers as worker
  on worker.organization_id = run.organization_id
 and worker.id = '60000000-0000-4000-8000-000000000001'
where run.id = '81000000-0000-4000-8000-000000000001'
  and run.organization_id = '10000000-0000-4000-8000-000000000001'
  and run.site_id = '40000000-0000-4000-8000-000000000001'
on conflict (id) do nothing;

create function private.reject_evidence_self_approval()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.outcome = 'approved' and exists (
    select 1 from public.evidence_pairs as pair
    join public.task_evidence as evidence
      on evidence.id in (pair.before_evidence_id, pair.after_evidence_id)
    where pair.task_run_id = new.task_run_id
      and pair.submission_revision = new.submission_revision
      and evidence.submitted_by_user_id = new.reviewer_user_id
  ) then
    raise exception 'self_approval_denied' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger reject_evidence_self_approval_before_inspection
before insert on public.inspections
for each row execute function private.reject_evidence_self_approval();
