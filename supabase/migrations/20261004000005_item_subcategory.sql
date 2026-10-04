-- The wardrobe's subcategories (a T-shirt, jeans, sneakers...), set by the
-- user on the item details screen. The worker fills in the one it
-- recognised while it's still empty (keys in pipeline prompts.SUBCATEGORIES).
alter table public.items
  add column subcategory text check (subcategory ~ '^[a-z_]{1,30}$');

grant update (subcategory) on public.items to authenticated;
