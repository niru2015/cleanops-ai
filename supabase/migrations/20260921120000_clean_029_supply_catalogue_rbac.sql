-- CLEAN-029: restrict supplier and inventory item catalogue access.

create or replace function private.can_view_supply_catalogue(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_org_role(
    p_organization_id,
    array[
      'area_manager'::public.app_role,
      'operations_manager'::public.app_role,
      'organization_administrator'::public.app_role
    ]
  );
$$;

create or replace function private.can_edit_supply_catalogue(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_administer_org(p_organization_id);
$$;

drop policy if exists vendors_select on public.vendors;
create policy vendors_select on public.vendors for select to authenticated
  using (private.can_view_supply_catalogue(organization_id));

drop policy if exists vendors_insert on public.vendors;
create policy vendors_insert on public.vendors for insert to authenticated
  with check (private.can_edit_supply_catalogue(organization_id));

drop policy if exists vendors_update on public.vendors;
create policy vendors_update on public.vendors for update to authenticated
  using (private.can_edit_supply_catalogue(organization_id))
  with check (private.can_edit_supply_catalogue(organization_id));

drop policy if exists inventory_items_select on public.inventory_items;
create policy inventory_items_select on public.inventory_items for select to authenticated
  using (private.can_view_supply_catalogue(organization_id));

drop policy if exists inventory_items_insert on public.inventory_items;
create policy inventory_items_insert on public.inventory_items for insert to authenticated
  with check (private.can_edit_supply_catalogue(organization_id));

drop policy if exists inventory_items_update on public.inventory_items;
create policy inventory_items_update on public.inventory_items for update to authenticated
  using (private.can_edit_supply_catalogue(organization_id))
  with check (private.can_edit_supply_catalogue(organization_id));
