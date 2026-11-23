import type { Db } from "@/server/db";
import type { Deps } from "@/server/deps";
import { AppError } from "@/server/errors";
import type { UserId } from "@/server/ports/auth";
import { friendshipBetween } from "../friends";

export type Resolved = { linkId: string; senderId: UserId; claimerId: UserId };

export type Person = { id: string; name: string };

export type Candidate = { id: string; other: UserId; byPhone: boolean };

const LOCK_ATTEMPTS = 3;
const LINKS_GREW = new Error("crossed links appeared during the lock");

export async function attributeLink(
  db: Db,
  linkId: string,
  claimer: UserId,
  nowIso: string,
): Promise<void> {
  await db.query(
    "update guest_links set status = 'claimed', claimed_by = $2, claimed_at = $3 where id = $1",
    [linkId, claimer, nowIso],
  );
  const [flight] = await db.query<{ bird_id: string; note_id: string | null }>(
    `update flights set counterpart_id = $2
     where guest_link_id = $1 and kind = 'delivery' returning bird_id, note_id`,
    [linkId, claimer],
  );
  if (flight.note_id)
    await db.query("update notes set recipient_id = $2 where id = $1", [
      flight.note_id,
      claimer,
    ]);
  await db.query(
    `update visits set host_id = $2
     where guest_link_id = $1 and status = 'waiting' and leaves_at > $3`,
    [linkId, claimer, nowIso],
  );
  await db.query(
    `insert into bird_meetings (user_id, bird_id, first_at) values ($1, $2, $3)
     on conflict (user_id, bird_id) do nothing`,
    [claimer, flight.bird_id, nowIso],
  );
}

const CANDIDATES = `
  with dir (sender_id, recipient_id) as (
    values ($1::uuid, $2::uuid), ($2::uuid, $1::uuid)
  )
  select gl.id, m.by_phone
    from dir d
    join guest_links gl on gl.sender_id = d.sender_id
    join profiles r on r.id = d.recipient_id
    cross join lateral (
      select gl.id in (
        select fp.id from public.guest_links_for_phone(d.recipient_id) fp
      ) as by_phone
    ) m
   where gl.status = 'active'
     and gl.claimed_by is null
     and (gl.expires_at is null or gl.expires_at > $3)
     and (
       m.by_phone
       or (
         gl.notify_phone is null
         and $4::boolean
         and lower(trim(gl.recipient_name)) = lower(trim(r.name))
         and (select count(*) from guest_links o
               where o.sender_id = gl.sender_id and o.status = 'active'
                 and lower(trim(o.recipient_name)) = lower(trim(gl.recipient_name))) = 1
         and (select count(*) from (
                select case when f.a_id = gl.sender_id then f.b_id else f.a_id end as other
                  from friendships f
                 where gl.sender_id in (f.a_id, f.b_id)
                union
                select d.recipient_id
              ) fr
                join profiles p on p.id = fr.other
               where lower(trim(p.name)) = lower(trim(gl.recipient_name))) = 1
       )
     )`;

export async function linksBetween(
  db: Db,
  a: UserId,
  b: UserId,
  now: number,
  friends: boolean,
): Promise<{ id: string; byPhone: boolean }[]> {
  const rows = await db.query<{ id: string; by_phone: boolean }>(CANDIDATES, [
    a,
    b,
    new Date(now).toISOString(),
    friends,
  ]);
  return rows.map((r) => ({ id: r.id, byPhone: r.by_phone }));
}

export async function resolveLinksBetween(
  db: Db,
  a: UserId,
  b: UserId,
  now: number,
  owned?: readonly Candidate[],
): Promise<Resolved[]> {
  const friendship = await friendshipBetween(db, a, b);
  if (friendship?.status === "blocked") return [];
  const nowIso = new Date(now).toISOString();

  const fresh = (
    await linksBetween(db, a, b, now, friendship?.status === "accepted")
  ).map((l) => l.id);
  // A phone match was validated before the locks and stays pinned even if
  // landing clears notify_phone meanwhile. A name match must still be
  // unambiguous after the locks.
  const ids = owned
    ? owned
        .filter(
          (c) =>
            (c.other === a || c.other === b) &&
            (c.byPhone || fresh.includes(c.id)),
        )
        .map((c) => c.id)
    : fresh;
  if (ids.length === 0) return [];

  await db.query(
    `select 1 from flights where guest_link_id = any($1) and kind = 'delivery'
     order by id for update`,
    [ids],
  );
  const locked = await db.query<{ id: string; sender_id: UserId }>(
    `select id, sender_id from guest_links
     where id = any($1) and status = 'active' and claimed_by is null
       and (expires_at is null or expires_at > $2) and sender_id = any($3)
     order by id for update`,
    [ids, nowIso, [a, b]],
  );

  const resolved: Resolved[] = [];
  for (const link of locked) {
    const claimerId = link.sender_id === a ? b : a;
    await attributeLink(db, link.id, claimerId, nowIso);
    resolved.push({ linkId: link.id, senderId: link.sender_id, claimerId });
  }
  if (resolved.length > 0)
    await db.query(
      `insert into events (user_id, kind, created_at)
       select u, k, $2 from unnest($1::uuid[]) u, unnest(array['friends', 'flight']) k`,
      [[a, b], nowIso],
    );
  return resolved;
}

export async function linksToMyPhone(db: Db, me: UserId): Promise<Candidate[]> {
  const rows = await db.query<{ id: string; sender_id: UserId }>(
    "select id, sender_id from public.guest_links_for_phone($1)",
    [me],
  );
  return rows.map((r) => ({ id: r.id, other: r.sender_id, byPhone: true }));
}

// Flights before profiles, the order landing takes them. Any link that
// appears between the scan and the profile locks retries the transaction.
export async function lockPeopleAndLinks(
  db: Db,
  me: UserId,
  others: readonly UserId[],
  now: number,
  also: readonly Candidate[] = [],
): Promise<{ people: Person[]; owned: Candidate[] }> {
  const open: UserId[] = [];
  for (const other of others)
    if ((await friendshipBetween(db, me, other))?.status !== "blocked")
      open.push(other);
  const scan = async () => {
    const found: Candidate[] = [];
    for (const other of open)
      for (const link of await linksBetween(db, me, other, now, true))
        found.push({ ...link, other });
    return found;
  };

  const byId = new Map<string, Candidate>();
  for (const c of [...also, ...(await scan())]) {
    const seen = byId.get(c.id);
    byId.set(c.id, { ...c, byPhone: c.byPhone || !!seen?.byPhone });
  }
  const owned = [...byId.values()];
  await db.query(
    `select 1 from flights where guest_link_id = any($1::uuid[]) and kind = 'delivery'
     order by id for update`,
    [[...byId.keys()]],
  );
  const people = await db.query<Person>(
    "select id, name from profiles where id = any($1::uuid[]) order by id for update",
    [[me, ...others]],
  );
  if ((await scan()).some((c) => !byId.has(c.id))) throw LINKS_GREW;
  return { people, owned };
}

export async function txLockingLinks<T>(
  deps: Deps,
  fn: (db: Db) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await deps.db.tx(fn);
    } catch (err) {
      if (err !== LINKS_GREW) throw err;
      if (attempt === LOCK_ATTEMPTS)
        throw new AppError("unavailable", "Try again in a moment");
    }
  }
}
