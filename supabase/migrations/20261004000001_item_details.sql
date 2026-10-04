-- The item details screen: users name an item, keep notes on it, and set
-- what kind of item it is (which also picks the styling for a regenerate).
-- The worker fills in the kind it recognised while it's still 'auto'.
alter table public.items
  add column name text check (char_length(name) <= 60),
  add column notes text check (char_length(notes) <= 500);

grant update (category, name, notes) on public.items to authenticated;
