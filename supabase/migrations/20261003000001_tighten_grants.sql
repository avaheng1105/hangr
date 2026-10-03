-- Supabase's default privileges also give anon and authenticated TRUNCATE
-- (which ignores row-level security) and full access to jobs. The API
-- can't issue TRUNCATE, but nothing needs these, so drop them.
revoke truncate, references, trigger on public.items, public.item_assets, public.jobs
  from anon, authenticated;
revoke all on public.jobs from anon, authenticated;
revoke all on public.items, public.item_assets from anon;
