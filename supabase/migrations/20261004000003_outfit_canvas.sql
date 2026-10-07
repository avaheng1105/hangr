-- Where each item sits when an outfit is styled on the canvas: the centre
-- as a fraction of the board (0..1 across, 0..1 down), its width as a
-- fraction of the board, and stacking order. Null = not placed yet, and the
-- app lays it out head to toe.
alter table public.outfit_items
  add column x real check (x between 0 and 1),
  add column y real check (y between 0 and 1),
  add column scale real check (scale between 0.05 and 1.5),
  add column z int;
