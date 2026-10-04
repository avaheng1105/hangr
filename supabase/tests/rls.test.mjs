// Checks the migrations' access rules in an in-memory Postgres (PGlite),
// with small stand-ins for Supabase's auth and storage schemas.
//   cd supabase/tests && npm install && npm test
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const db = new PGlite();
// Minimal stand-ins for what Supabase provides.
await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create schema storage;
create table storage.buckets (id text primary key, name text, public bool);
create table storage.objects (id serial primary key, bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as
  $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'),1)-1] $$;
create function storage.filename(name text) returns text language sql immutable as
  $$ select (string_to_array(name, '/'))[array_length(string_to_array(name, '/'),1)] $$;
grant usage on schema public, auth, storage to anon, authenticated, service_role;
grant all on all tables in schema storage to authenticated, service_role;
grant usage, select on all sequences in schema storage to authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
`);
for (const file of fs.readdirSync(new URL('../migrations/', import.meta.url)).sort()) {
  await db.exec(fs.readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
}
const A = '11111111-1111-1111-1111-111111111111', B = '22222222-2222-2222-2222-222222222222';
await db.exec(`insert into auth.users values ('${A}'), ('${B}')`);
const as = async (uid, sql) => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
  try { return { ok: (await db.query(sql)).rows }; } catch (e) { return { err: e.message }; }
  finally { await db.exec('reset role'); }
};
const check = (name, cond, got) => { console.log((cond ? 'PASS ' : 'FAIL ') + name, cond ? '' : JSON.stringify(got)); if (!cond) process.exitCode = 1; };

let r = await as(A, `insert into public.items (category) values ('top') returning id, user_id, status`);
check('A creates an item, owned by A', r.ok && r.ok[0].user_id === A && r.ok[0].status === 'uploading', r);
const item = r.ok[0].id;
r = await as(A, `insert into public.items (category, status) values ('top', 'ready')`);
check('A cannot set status on create', !!r.err, r);
r = await as(A, `insert into public.items (category, user_id) values ('top', '${B}')`);
check('A cannot create an item for B', !!r.err, r);
r = await as(B, `select * from public.items`);
check('B cannot see A items', r.ok && r.ok.length === 0, r);
r = await as(A, `update public.items set review_resolution = 'kept' where id = '${item}' returning review_resolution`);
check('A records a review choice', r.ok && r.ok[0]?.review_resolution === 'kept', r);
r = await as(A, `update public.items set meta = '{}' where id = '${item}'`);
check('A cannot write meta', !!r.err, r);
r = await as(A, `update public.items set status = 'ready' where id = '${item}'`);
check('A cannot write status', !!r.err, r);
r = await as(A, `update public.items set category = 'skirt', name = 'Wrap skirt', notes = 'size S' where id = '${item}' returning category, name, notes`);
check('A sets category, name and notes', r.ok && r.ok[0]?.name === 'Wrap skirt' && r.ok[0]?.category === 'skirt', r);
r = await as(A, `update public.items set category = 'hat' where id = '${item}'`);
check('A cannot set an unknown category', !!r.err, r);
r = await as(A, `update public.items set subcategory = 'jeans' where id = '${item}' returning subcategory`);
check('A sets a subcategory', r.ok && r.ok[0]?.subcategory === 'jeans', r);
r = await as(A, `update public.items set subcategory = 'Not a key!' where id = '${item}'`);
check('A cannot set a malformed subcategory', !!r.err, r);
r = await as(A, `update public.items set name = repeat('x', 61) where id = '${item}'`);
check('A cannot set an over-long name', !!r.err, r);
r = await as(B, `update public.items set name = 'mine' where id = '${item}' returning id`);
check('B cannot rename A item', r.ok && r.ok.length === 0, r);
r = await as(B, `update public.items set review_resolution = 'photo' where id = '${item}' returning id`);
check('B cannot review A item', r.ok && r.ok.length === 0, r);
r = await as(A, `insert into public.item_assets values ('${item}', 'cutout.png', 'x')`);
check('A cannot write assets', !!r.err, r);
await db.exec(`insert into public.item_assets values ('${item}', 'cutout.png', '${A}/${item}/g1/cutout.png')`);
r = await as(A, `select * from public.item_assets`);
check('A reads own assets', r.ok && r.ok.length === 1, r);
r = await as(B, `select * from public.item_assets`);
check('B cannot read A assets', r.ok && r.ok.length === 0, r);
r = await as(A, `insert into storage.objects (bucket_id, name) values ('items', '${A}/${item}/upload')`);
check('A uploads the photo of own item', r.ok, r);
r = await as(A, `insert into storage.objects (bucket_id, name) values ('items', '${A}/${item}/g1/cutout.png')`);
check('A cannot upload pipeline assets', !!r.err, r);
r = await as(B, `insert into storage.objects (bucket_id, name) values ('items', '${B}/${item}/upload')`);
check('B cannot upload into A item', !!r.err, r);
r = await as(B, `select * from storage.objects`);
check('B cannot read A files', r.ok && r.ok.length === 0, r);
r = await as(A, `select * from storage.objects`);
check('A reads own files', r.ok && r.ok.length === 1, r);
r = await as(A, `delete from public.items where id = '${item}' returning id`);
check('A deletes own item (assets cascade)', r.ok && r.ok.length === 1 && (await db.query('select count(*)::int n from public.item_assets')).rows[0].n === 0, r);

// claim_item
await db.exec(`reset role`);
r = await as(A, `insert into public.items (category) values ('top') returning id`);
const it2 = r.ok[0].id;
r = await as(A, `select public.claim_item('${it2}', 'process', array['uploading'], 5)`);
check('users cannot call claim_item', !!r.err, r);
await db.exec(`set role service_role`);
let g = (await db.query(`select public.claim_item('${it2}', 'process', array['uploading','failed'], 5) g`)).rows[0].g;
check('claim moves to processing, generation 1', g === 1, g);
g = (await db.query(`select public.claim_item('${it2}', 'process', array['uploading','failed'], 5) g`)).rows[0].g;
check('second claim while processing is refused', g === null, g);
await db.exec(`update public.items set status = 'ready' where id = '${it2}'`);
for (let i = 0; i < 4; i++) {
  await db.query(`select public.claim_item('${it2}', 'regenerate', array['ready'], 5)`);
  await db.exec(`update public.items set status = 'ready' where id = '${it2}'`);
}
let err = null;
try { await db.query(`select public.claim_item('${it2}', 'regenerate', array['ready'], 5)`); } catch (e) { err = e.message; }
check('sixth job in a day hits the limit', err === 'daily limit reached', err);
const st = (await db.query(`select status, generation from public.items where id = '${it2}'`)).rows[0];
check('refused claim leaves the item alone', st.status === 'ready' && st.generation === 5, st);
await db.exec('reset role');

// Deleting files
await db.exec(`reset role`);
await db.exec(`insert into storage.objects (bucket_id, name) values ('items', '${A}/x/g1/cutout.png'), ('items', '${B}/y/g1/cutout.png')`);
r = await as(B, `delete from storage.objects where name like '${A}/%' returning name`);
check("B cannot delete A's files", r.ok && r.ok.length === 0, r);
r = await as(A, `delete from storage.objects where name = '${A}/x/g1/cutout.png' returning name`);
check('A deletes own files', r.ok && r.ok.length === 1, r);

// Outfits
r = await as(A, `insert into public.items (category) values ('bottom') returning id`);
const aItem = r.ok[0].id;
r = await as(B, `insert into public.items (category) values ('top') returning id`);
const bItem = r.ok[0].id;
r = await as(A, `insert into public.outfits (name) values ('Monday') returning id, user_id`);
check('A creates an outfit, owned by A', r.ok && r.ok[0].user_id === A, r);
const outfit = r.ok[0].id;
r = await as(A, `insert into public.outfits (name, user_id) values ('x', '${B}')`);
check('A cannot create an outfit for B', !!r.err, r);
r = await as(A, `insert into public.outfit_items (outfit_id, item_id, position) values ('${outfit}', '${aItem}', 0) returning item_id`);
check('A adds own item to own outfit', r.ok && r.ok.length === 1, r);
r = await as(A, `insert into public.outfit_items (outfit_id, item_id) values ('${outfit}', '${bItem}')`);
check("A cannot add B's item", !!r.err, r);
r = await as(B, `insert into public.outfit_items (outfit_id, item_id) values ('${outfit}', '${bItem}')`);
check("B cannot add to A's outfit", !!r.err, r);
r = await as(B, `select * from public.outfits`);
check("B cannot see A's outfits", r.ok && r.ok.length === 0, r);
r = await as(B, `select * from public.outfit_items`);
check("B cannot see A's outfit items", r.ok && r.ok.length === 0, r);
r = await as(A, `update public.outfits set name = 'Tuesday' where id = '${outfit}' returning name`);
check('A renames own outfit', r.ok && r.ok[0]?.name === 'Tuesday', r);
r = await as(A, `update public.outfits set user_id = '${B}' where id = '${outfit}'`);
check('A cannot hand an outfit to B', !!r.err, r);
r = await as(A, `delete from public.items where id = '${aItem}'`);
r = await as(A, `select * from public.outfit_items where outfit_id = '${outfit}'`);
check('deleting an item takes it out of outfits', r.ok && r.ok.length === 0, r);
r = await as(A, `delete from public.outfits where id = '${outfit}' returning id`);
check('A deletes own outfit', r.ok && r.ok.length === 1, r);

// Canvas layout
r = await as(A, `insert into public.items (category) values ('top') returning id`);
const cItem = r.ok[0].id;
r = await as(A, `insert into public.outfits (name) values ('Canvas') returning id`);
const cOutfit = r.ok[0].id;
r = await as(A, `insert into public.outfit_items (outfit_id, item_id, position) values ('${cOutfit}', '${cItem}', 0)`);
r = await as(A, `update public.outfit_items set x = 0.4, y = 0.3, scale = 0.5, z = 2 where outfit_id = '${cOutfit}' returning x, z`);
check('A places an item on the canvas', r.ok && r.ok[0]?.z === 2, r);
r = await as(A, `update public.outfit_items set x = 3 where outfit_id = '${cOutfit}'`);
check('a position off the board is refused', !!r.err, r);
r = await as(B, `update public.outfit_items set x = 0.1 where outfit_id = '${cOutfit}' returning x`);
check("B cannot move A's canvas items", r.ok && r.ok.length === 0, r);
r = await as(A, `insert into public.outfit_items (outfit_id, item_id, position) values ('${cOutfit}', '${cItem}', 1) on conflict (outfit_id, item_id) do update set position = excluded.position returning x, position`);
check('re-saving the outfit keeps the placement', r.ok && r.ok[0]?.position === 1 && Math.abs(r.ok[0].x - 0.4) < 1e-6, r);

// Calendar
r = await as(A, `insert into public.outfits (name) values ('Day') returning id`);
const dOutfit = r.ok[0].id;
r = await as(B, `insert into public.outfits (name) values ('B day') returning id`);
const bOutfit = r.ok[0].id;
r = await as(A, `insert into public.outfit_days (day, outfit_id) values ('2026-10-05', '${dOutfit}') returning user_id`);
check('A plans an outfit for a day', r.ok && r.ok[0]?.user_id === A, r);
r = await as(A, `insert into public.outfit_days (day, outfit_id) values ('2026-10-06', '${bOutfit}')`);
check("A cannot put B's outfit on the calendar", !!r.err, r);
r = await as(A, `insert into public.outfit_days (day, outfit_id) values ('2026-10-05', '${dOutfit}') on conflict (user_id, day) do update set outfit_id = excluded.outfit_id returning day`);
check('A changes the outfit for a day', r.ok && r.ok.length === 1, r);
r = await as(B, `select * from public.outfit_days`);
check("B cannot see A's calendar", r.ok && r.ok.length === 0, r);
r = await as(A, `delete from public.outfits where id = '${dOutfit}'`);
r = await as(A, `select * from public.outfit_days`);
check('deleting an outfit clears its days', r.ok && r.ok.length === 0, r);
