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
