// Applies the migration to an in-process Postgres and checks the rules the app relies on.
// Run from the packet root:  npm i --no-save @electric-sql/pglite && node --test supabase/test/schema.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const db = new PGlite();
await db.exec(read('./auth-stub.sql'));
await db.exec(read('../migrations/0001_init.sql'));

const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const user = async (handle) => {
  const { id } = await one('insert into auth.users default values returning id');
  await db.query('insert into profiles (id, name, handle, invite_code) values ($1, $2, $2, $3)', [id, handle, handle + '-abcd']);
  return id;
};
const fails = (p, re) => assert.rejects(p, re);
const max = await user('max'), priya = await user('priya');

test('every table has row level security on, and only events has a policy', async () => {
  const off = (await db.query("select tablename from pg_tables where schemaname = 'public' and not rowsecurity")).rows;
  assert.deepEqual(off, []);
  const pol = (await db.query("select tablename, policyname from pg_policies where schemaname = 'public'")).rows;
  assert.deepEqual(pol, [{ tablename: 'events', policyname: 'events_read_own' }]);
});

test('seeds: earn, spend, never below zero, never twice', async () => {
  const ref = (await one('select gen_random_uuid() as id')).id;
  assert.equal((await one('select apply_seeds($1, 60, $2) as n', [max, 'welcome'])).n, 60);
  assert.equal((await one('select apply_seeds($1, 13, $2, $3) as n', [max, 'delivery', ref])).n, 73);
  assert.equal((await one('select apply_seeds($1, 13, $2, $3) as n', [max, 'delivery', ref])).n, 73, 'a repeat pays nothing');
  assert.equal((await one('select apply_seeds($1, -20, $2) as n', [max, 'search_party'])).n, 53);
  await fails(db.query('select apply_seeds($1, -500, $2)', [max, 'shop']), /insufficient_seeds/);
  assert.equal((await one('select seeds from profiles where id = $1', [max])).seeds, 53);
  assert.equal((await one('select coalesce(sum(delta), 0)::int as n from seed_ledger where user_id = $1', [max])).n, 53, 'ledger adds up to the balance');
});

test('friendships are stored once per pair, smaller id first', async () => {
  const [a, b] = [max, priya].sort();
  await db.query('insert into friendships (a_id, b_id) values ($1, $2)', [a, b]);
  await fails(db.query('insert into friendships (a_id, b_id) values ($1, $2)', [b, a]), /check/);
  await fails(db.query('insert into friendships (a_id, b_id) values ($1, $2)', [a, b]), /duplicate|unique/);
});

test('a bird can only be on one active flight', async () => {
  const bird = (await one("insert into birds (owner_id, name, speed_mph, focus, navigation) values ($1, 'Gerald', 45, 2, 4) returning id", [max])).id;
  const fly = (status) => db.query(
    `insert into flights (kind, bird_id, owner_id, counterpart_id, from_lat, from_lon, from_label, to_lat, to_lon, to_label, status, release_at)
     values ('delivery', $1, $2, $3, 40.73, -73.99, 'East Village', 39.95, -75.17, 'Philadelphia', $4, now()) returning id`, [bird, max, priya, status]);
  const first = (await fly('flying')).rows[0].id;
  await fails(fly('flying'), /duplicate|unique/);
  await fails(fly('scheduled'), /duplicate|unique/);
  await db.query("update flights set status = 'landed', landed_at = now() where id = $1", [first]);
  await fly('flying');
});

test('busy birds must say what they are busy with', async () => {
  await fails(db.query("insert into birds (owner_id, name, speed_mph, focus, navigation, status) values ($1, 'Kevin', 38, 1, 2, 'busy')", [max]), /check/);
  await db.query("insert into birds (owner_id, name, speed_mph, focus, navigation, status, busy_kind, busy_until) values ($1, 'Kevin', 38, 1, 2, 'busy', 'nap', now() + interval '30 minutes')", [max]);
});

test('notes: length limits', async () => {
  await fails(db.query("insert into notes (sender_id, recipient_id, body) values ($1, $2, '')", [max, priya]), /check/);
  await fails(db.query('insert into notes (sender_id, recipient_id, body) values ($1, $2, $3)', [max, priya, 'x'.repeat(561)]), /check/);
  await db.query('insert into notes (sender_id, recipient_id, body) values ($1, $2, $3)', [max, priya, 'x'.repeat(560)]);
});

test('one open egg per person; notifications and found objects cannot double up', async () => {
  await db.query('insert into eggs (user_id, hatch_at_delivery) values ($1, 5)', [max]);
  await fails(db.query('insert into eggs (user_id, hatch_at_delivery) values ($1, 30)', [max]), /duplicate|unique/);
  const ref = (await one('select gen_random_uuid() as id')).id;
  const note = () => db.query("insert into notifications (user_id, kind, title, body, ref_id) values ($1, 'landed-in', 't', 'b', $2) on conflict do nothing returning id", [priya, ref]);
  assert.equal((await note()).rows.length, 1);
  assert.equal((await note()).rows.length, 0);
});

test('events: a signed-in user reads only their own rows', async () => {
  await db.query("insert into events (user_id, kind) values ($1, 'flight'), ($2, 'flight')", [max, priya]);
  await db.exec(`set request.jwt.claim.sub = '${max}'; set role authenticated;`);
  const rows = (await db.query('select user_id from events')).rows;
  await fails(db.query('select * from profiles'), /permission denied/);
  await db.exec('reset role;');
  assert.deepEqual(rows, [{ user_id: max }]);
});

test('deleting an account removes everything that belongs to it', async () => {
  await db.query('delete from auth.users where id = $1', [max]);
  for (const t of ['profiles', 'birds', 'flights', 'seed_ledger', 'eggs', 'events']) {
    const col = t === 'profiles' ? 'id' : t === 'birds' || t === 'flights' ? 'owner_id' : 'user_id';
    assert.equal((await one(`select count(*)::int as n from ${t} where ${col} = $1`, [max])).n, 0, t);
  }
  assert.equal((await one('select count(*)::int as n from profiles')).n, 1);
});
