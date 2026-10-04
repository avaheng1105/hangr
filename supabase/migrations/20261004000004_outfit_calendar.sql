-- The calendar: which outfit the user wore, or plans to wear, on a day.
-- One outfit per day; deleting the outfit clears its days.
create table public.outfit_days (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  day date not null,
  outfit_id uuid not null references public.outfits on delete cascade,
  primary key (user_id, day)
);

create index outfit_days_outfit on public.outfit_days (outfit_id);

alter table public.outfit_days enable row level security;

create policy "own days" on public.outfit_days
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.outfits o where o.id = outfit_id and o.user_id = auth.uid())
  );

revoke all on public.outfit_days from anon;
revoke truncate, references, trigger on public.outfit_days from authenticated;
