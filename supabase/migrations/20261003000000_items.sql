-- Closet items and their pipeline assets.
--
-- The app creates an item, uploads the photo to Storage at
-- {user_id}/{item_id}/upload, and calls the `jobs` Edge Function. The GPU
-- worker (pipeline/modal_app.py) does the work and writes the results back
-- with the service role: assets under {user_id}/{item_id}/g{generation}/,
-- one item_assets row per file, and the pipeline's meta.json in items.meta.
-- Users can only read their own rows, create items, and record what they
-- chose on the review screen.

create table public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  -- Picks the styling in the image prompt (pipeline prompts.CATEGORIES).
  category text not null default 'auto' check (
    category in ('top', 'outerwear', 'dress', 'bottom', 'skirt', 'shoes', 'bag',
                 'jewelry', 'accessory', 'auto')
  ),
  status text not null default 'uploading'
    check (status in ('uploading', 'processing', 'ready', 'failed')),
  -- Bumped by every pipeline run, so new assets get new paths (no stale caches).
  generation int not null default 0,
  meta jsonb,
  -- What the user picked for an item flagged needs_review: keep the image,
  -- or use their photo (the photo_* assets). Null = not reviewed yet.
  review_resolution text check (review_resolution in ('kept', 'photo')),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index items_user_created on public.items (user_id, created_at desc);

create table public.item_assets (
  item_id uuid not null references public.items on delete cascade,
  -- Pipeline file name: original.webp, enhanced.webp, cutout.png, thumb.webp,
  -- photo_cutout.png, photo_thumb.webp.
  kind text not null,
  -- Path in the `items` Storage bucket.
  path text not null,
  primary key (item_id, kind)
);

create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger items_touch before update on public.items
  for each row execute function public.touch_updated_at();

alter table public.items enable row level security;
alter table public.item_assets enable row level security;

create policy "own items: read" on public.items
  for select to authenticated using (user_id = auth.uid());
create policy "own items: create" on public.items
  for insert to authenticated with check (user_id = auth.uid());
create policy "own items: review" on public.items
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own items: delete" on public.items
  for delete to authenticated using (user_id = auth.uid());

create policy "own assets: read" on public.item_assets
  for select to authenticated using (
    exists (select 1 from public.items i where i.id = item_id and i.user_id = auth.uid())
  );

-- Column grants: users set the category when creating an item and the
-- review choice afterwards; status, meta and assets are the worker's.
revoke insert, update on public.items from anon, authenticated;
grant insert (category) on public.items to authenticated;
grant update (review_resolution) on public.items to authenticated;
revoke insert, update, delete on public.item_assets from anon, authenticated;

insert into storage.buckets (id, name, public) values ('items', 'items', false);

-- Files live under {user_id}/...; users read their own and upload only the
-- raw photo of an item they own.
create policy "own files: read" on storage.objects
  for select to authenticated using (
    bucket_id = 'items' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "own files: upload photo" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'items'
    and (storage.foldername(name))[1] = auth.uid()::text
    and storage.filename(name) = 'upload'
    and exists (
      select 1 from public.items i
      where i.id::text = (storage.foldername(name))[2] and i.user_id = auth.uid()
    )
  );

-- One row per pipeline run, for the daily limit below and for counting
-- Gemini calls (about 2 per regenerate, up to 4 per new photo).
create table public.jobs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  item_id uuid not null references public.items on delete cascade,
  type text not null check (type in ('process', 'regenerate')),
  created_at timestamptz not null default now()
);

create index jobs_user_created on public.jobs (user_id, created_at desc);
alter table public.jobs enable row level security;  -- no policies: service role only

-- Called by the `jobs` Edge Function (service role) to start a run: moves
-- the item to "processing", bumps its generation and logs the job, but only
-- if the item is in one of `from_status` (so a double tap can't start two
-- runs) and the user is under `daily_limit` jobs in the last 24 hours.
-- Returns the new generation, or null if refused.
create function public.claim_item(
  p_item uuid, p_type text, from_status text[], daily_limit int
) returns int
language plpgsql as $$
declare
  owner uuid;
  gen int;
begin
  select user_id into owner from public.items where id = p_item;
  if owner is null then
    return null;
  end if;
  if (select count(*) from public.jobs
      where user_id = owner and created_at > now() - interval '24 hours') >= daily_limit then
    raise exception 'daily limit reached' using errcode = 'P0001', hint = 'daily_limit';
  end if;
  update public.items
     set status = 'processing', generation = generation + 1, error = null
   where id = p_item and status = any(from_status)
  returning generation into gen;
  if gen is not null then
    insert into public.jobs (user_id, item_id, type) values (owner, p_item, p_type);
  end if;
  return gen;
end $$;

revoke execute on function public.claim_item from public, anon, authenticated;
grant execute on function public.claim_item to service_role;
