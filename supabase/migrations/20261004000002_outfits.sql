-- Outfits: a named set of the user's items. Deleting an item takes it out
-- of every outfit; deleting an outfit leaves the items alone.
create table public.outfits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text check (char_length(name) <= 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index outfits_user_created on public.outfits (user_id, created_at desc);

create trigger outfits_touch before update on public.outfits
  for each row execute function public.touch_updated_at();

create table public.outfit_items (
  outfit_id uuid not null references public.outfits on delete cascade,
  item_id uuid not null references public.items on delete cascade,
  -- Order in the outfit, top to bottom.
  position int not null default 0,
  primary key (outfit_id, item_id)
);

create index outfit_items_item on public.outfit_items (item_id);

alter table public.outfits enable row level security;
alter table public.outfit_items enable row level security;

create policy "own outfits" on public.outfits
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Both the outfit and the item must be the user's own.
create policy "own outfit items" on public.outfit_items
  for all to authenticated
  using (exists (select 1 from public.outfits o where o.id = outfit_id and o.user_id = auth.uid()))
  with check (
    exists (select 1 from public.outfits o where o.id = outfit_id and o.user_id = auth.uid())
    and exists (select 1 from public.items i where i.id = item_id and i.user_id = auth.uid())
  );

revoke all on public.outfits, public.outfit_items from anon;
revoke truncate, references, trigger on public.outfits, public.outfit_items from authenticated;
revoke insert, update on public.outfits from authenticated;
grant insert (name), update (name) on public.outfits to authenticated;
