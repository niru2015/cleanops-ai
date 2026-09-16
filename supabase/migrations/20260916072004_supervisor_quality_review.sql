-- Commit workflow states separately so later migrations may safely use the new enum labels.
alter type public.task_run_state add value if not exists 'correction_required' after 'submitted';
alter type public.task_run_state add value if not exists 'approved' after 'correction_required';
