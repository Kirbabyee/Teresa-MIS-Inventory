insert into public.inventory_tabs (name, slug, description, sort_order)
values (
  'Comlab',
  'comlab',
  'Comlab inventory tab.',
  2
)
on conflict (slug) do nothing;

do $$
declare
  computer_lab_tab_id uuid;
begin
  select id into computer_lab_tab_id
  from public.inventory_tabs
  where slug = 'comlab'
  limit 1;

  if computer_lab_tab_id is not null then
    insert into public.inventory_sections (tab_id, name, slug, description, sort_order)
    values (
      computer_lab_tab_id,
      'Comlab',
      'comlab',
      'Inventory for Comlab.',
      1
    )
    on conflict (tab_id, slug) do nothing;
  end if;
end $$;