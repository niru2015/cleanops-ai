import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

// One-run, exact-ID Gate A cleanup. The manifest and private backups remain ignored.
const [mode, manifestName] = process.argv.slice(2);
if (!['dry-run', 'apply'].includes(mode) || !manifestName) {
  throw new Error('Usage: node scripts/demo-uat-cleanup.mjs <dry-run|apply> <ignored-manifest.json>');
}
const manifestPath = resolve(manifestName);
const manifestBytes = await readFile(manifestPath);
if (createHash('sha256').update(manifestBytes).digest('hex') !==
  '00d189612708f9541e82ad65b3bccaecfc257c27bb0ebb2ed08bd06e7a553e0d')
  throw new Error('Gate A cleanup manifest changed after review. Re-inventory and review it before running cleanup.');
const manifest = JSON.parse(manifestBytes.toString('utf8'));
const root = resolve(import.meta.dirname, '..');
const artifactRoot = resolve(root, 'artifacts/tornado-demo/gate-a');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const identifier = /^[a-z][a-z0-9_]*$/;
if (manifest.projectRef !== 'jfhpbabelqldhemrmvgc' ||
  manifest.organizationId !== '62dc9966-0210-59ad-a8a6-fe5a89b68c0b' ||
  manifest.runId !== '8b419b91-c602-527c-bb5f-4cb8cf44048d' ||
  manifest.seed !== 20260926 || manifest.selectedRowCount !== 213 ||
  manifest.selectedRows.length !== 33 || manifest.organizationTableFingerprints.length !== 94)
  throw new Error('Manifest does not identify the registered Gate A synthetic run.');
if (mode === 'apply' && process.env.CLEANOPS_GATE_A_CLEANUP_APPROVED_RUN_ID !== manifest.runId)
  throw new Error('Apply requires explicit approved run ID in protected operator environment.');

const sourceFiles = Object.entries(manifest.sourceHashes);
for (const [name, expected] of sourceFiles) {
  const file = resolve(artifactRoot, name);
  if (!file.startsWith(`${artifactRoot}/`) || !/^[a-f0-9]{64}$/.test(expected)) throw new Error('Invalid audit source path or hash.');
  const actual = createHash('sha256').update(await readFile(file)).digest('hex');
  if (actual !== expected) throw new Error(`Audit source ${name} changed after review.`);
}
const storageInventory = JSON.parse(await readFile(resolve(artifactRoot, 'hosted-storage-inventory.json'), 'utf8'));
const backupRoot = resolve(artifactRoot, 'uat-storage-backup');
for (const object of manifest.storageObjects) {
  if (!uuid.test(object.id) || !object.path.startsWith(`${manifest.organizationId}/`)) throw new Error('Out-of-scope storage object.');
  if (!object.present) continue;
  if (!/^[a-f0-9]{64}$/.test(object.sha256) || object.file !== `${object.id}.bin`) throw new Error('Invalid storage backup.');
  const actual = createHash('sha256').update(await readFile(resolve(backupRoot, object.file))).digest('hex');
  if (actual !== object.sha256) throw new Error(`Storage backup ${object.id} changed.`);
}
const selectedIds = new Set();
for (const group of manifest.selectedRows) {
  if (!identifier.test(group.table) || !Array.isArray(group.ids) || !group.ids.length ||
    group.ids.some(id => !uuid.test(id) || selectedIds.has(id))) throw new Error('Invalid or duplicate selected row ID.');
  group.ids.forEach(id => selectedIds.add(id));
}
if (selectedIds.size !== manifest.selectedRowCount) throw new Error('Selected row count changed.');
for (const row of manifest.organizationTableFingerprints) {
  if (!identifier.test(row.table_name) || !/^[a-f0-9]{32}$/.test(row.fingerprint) ||
    !Number.isInteger(Number(row.row_count))) throw new Error('Invalid table fingerprint.');
}

function query(sql) {
  const out = execFileSync('npx', ['supabase', 'db', 'query', '--linked', '--project-ref', manifest.projectRef, sql],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 });
  return JSON.parse(out).rows;
}
const liveTables = query("select table_name from information_schema.columns where table_schema='public' and column_name='organization_id' order by table_name")
  .map(row => row.table_name);
const capturedTables = manifest.organizationTableFingerprints.map(row => row.table_name).sort();
if (JSON.stringify(liveTables) !== JSON.stringify(capturedTables))
  throw new Error('Organization-scoped schema changed after inventory.');
const tableSet = new Set(manifest.selectedRows.map(group => group.table));
const edges = query("select distinct conrelid::regclass::text child,confrelid::regclass::text parent from pg_constraint where contype='f' and connamespace='public'::regnamespace")
  .filter(edge => tableSet.has(edge.child) && tableSet.has(edge.parent) && edge.child !== edge.parent)
  .filter(edge => !(edge.child === 'time_entries' && edge.parent === 'labor_cost_entries'));
const remaining = new Set(tableSet), order = [];
while (remaining.size) {
  const ready = [...remaining].filter(table => !edges.some(edge => edge.parent === table && remaining.has(edge.child))).sort();
  if (!ready.length) throw new Error('Unexpected FK cycle in cleanup tables.');
  order.push(...ready);
  ready.forEach(table => remaining.delete(table));
}
const byTable = new Map(manifest.selectedRows.map(group => [group.table, group.ids]));
const expected = Object.fromEntries(manifest.organizationTableFingerprints.map(row =>
  [row.table_name, { count: Number(row.row_count), hash: row.fingerprint }]));
const expectedStorage = storageInventory.rows.map(row => ({ id: row.id, bucket: row.bucket_id, path: row.name }))
  .sort((a, b) => `${a.bucket}/${a.path}`.localeCompare(`${b.bucket}/${b.path}`));
const triggers = [
  ['contract_extraction_decisions', 'contract_decisions_immutable'],
  ['contract_extraction_proposals', 'contract_proposals_immutable'],
  ['expense_audit_events', 'expense_audit_immutable'],
  ['expense_postings', 'expense_postings_immutable'],
  ['labor_cost_entries', 'labor_cost_entries_audit'],
  ['labor_cost_entries', 'labor_cost_time_provenance_change'],
  ['service_tasks', 'service_tasks_contract_guard'],
  ['shift_coverage_requirements', 'coverage_contract_guard'],
  ['shifts', 'shifts_contract_guard'],
  ['task_schedules', 'task_schedules_contract_guard'],
  ['time_entry_events', 'time_entry_events_immutable'],
];
const org = manifest.organizationId;
const plan = order.map(table => ({ table, ids: byTable.get(table) }));
const sql = `begin isolation level serializable;
set local lock_timeout = '2s';
set local statement_timeout = '30s';
do $gate$
declare
  scope_id uuid := '${org}';
  expected jsonb := '${JSON.stringify(expected)}'::jsonb;
  selected jsonb := '${JSON.stringify(plan)}'::jsonb;
  stored_objects jsonb := '${JSON.stringify(expectedStorage)}'::jsonb;
  item record;
  entry jsonb;
  actual_count bigint;
  actual_hash text;
  actual_objects jsonb;
  ids uuid[];
  affected bigint;
begin
  perform 1 from public.organizations where id = scope_id and slug = 'scenario-finance-showcase' for update;
  if not found then raise exception 'Gate A organization identity changed'; end if;
  perform 1 from public.demo_scenario_runs where run_id = '${manifest.runId}' and organization_id = scope_id
    and project_ref = '${manifest.projectRef}' and status = 'ready' for update;
  if not found then raise exception 'Gate A registry identity or status changed'; end if;
  for item in select key,value from jsonb_each(expected) loop
    execute format('select count(*),md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),''[]''::jsonb)::text) from public.%I t where organization_id=$1', item.key)
      into actual_count,actual_hash using scope_id;
    if actual_count <> (item.value->>'count')::bigint or actual_hash <> item.value->>'hash' then
      raise exception 'Gate A organization drift in %', item.key;
    end if;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'bucket',bucket_id,'path',name) order by bucket_id,name),'[]'::jsonb)
    into actual_objects from storage.objects where name like scope_id::text || '/%';
  if actual_objects <> stored_objects then raise exception 'Gate A storage object set changed'; end if;
  ${triggers.map(([table, trigger]) => `execute 'alter table public.${table} disable trigger ${trigger}';`).join('\n  ')}
  update public.time_entries set state='approved', labor_cost_entry_id=null
    where organization_id=scope_id and id=any(array[${byTable.get('time_entries').map(id => `'${id}'::uuid`).join(',')}]) and state='posted';
  get diagnostics affected = row_count;
  if affected <> 2 then raise exception 'Gate A time-entry cycle changed'; end if;
  for entry in select value from jsonb_array_elements(selected) loop
    select array_agg(value::uuid) into ids from jsonb_array_elements_text(entry->'ids');
    execute format('delete from public.%I where organization_id=$1 and id=any($2)', entry->>'table') using scope_id,ids;
    get diagnostics affected = row_count;
    if affected <> jsonb_array_length(entry->'ids') then raise exception 'Gate A delete count changed in %',entry->>'table'; end if;
  end loop;
  ${triggers.slice().reverse().map(([table, trigger]) => `execute 'alter table public.${table} enable trigger ${trigger}';`).join('\n  ')}
end $gate$;
select 'Gate A exact cleanup ${mode === 'apply' ? 'applied' : 'dry-run passed'}' as result;
${mode === 'apply' ? 'commit' : 'rollback'};`;
const result = query(sql);
if (mode === 'dry-run') {
  console.log(JSON.stringify({ mode, projectRef: manifest.projectRef, organizationId: org,
    selectedRows: selectedIds.size, tables: order.length, storageObjects: manifest.storageObjects.filter(row => row.present).length,
    transaction: 'rolled back', result: result.at(-1)?.result ?? null }));
} else {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (new URL(url).hostname !== `${manifest.projectRef}.supabase.co` || !key) throw new Error('Storage cleanup credentials do not match project.');
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  for (const object of manifest.storageObjects.filter(row => row.present)) {
    const { error } = await client.storage.from(object.bucket).remove([object.path]);
    if (error) throw new Error(`Database cleanup committed; storage removal failed for ${object.id}. Use the local backup to reconcile.`);
  }
  console.log(JSON.stringify({ mode, projectRef: manifest.projectRef, organizationId: org,
    deletedRows: selectedIds.size, removedStorageObjects: manifest.storageObjects.filter(row => row.present).length }));
}
