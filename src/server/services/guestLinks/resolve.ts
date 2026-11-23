import type { Db } from "@/server/db";
import type { UserId } from "@/server/ports/auth";
import { friendshipBetween } from "../friends";

export type Resolved = { linkId: string; senderId: UserId; claimerId: UserId };

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
  select gl.id
    from dir d
    join guest_links gl on gl.sender_id = d.sender_id
    join profiles r on r.id = d.recipient_id
   where gl.status = 'active'
     and gl.claimed_by is null
     and (gl.expires_at is null or gl.expires_at > $3)
     and (
       gl.id in (select fp.id from public.guest_links_for_phone(d.recipient_id) fp)
       or (
         gl.notify_phone is null
         and $4::boolean
         and lower(trim(gl.recipient_name)) = lower(trim(r.name))
         and (select count(*) from guest_links o
               where o.sender_id = gl.sender_id and o.status = 'active'
                 and lower(trim(o.recipient_name)) = lower(trim(gl.recipient_name))) = 1
         and (select count(*) from friendships f
                join profiles p on p.id = case when f.a_id = gl.sender_id then f.b_id else f.a_id end
               where f.status = 'accepted' and gl.sender_id in (f.a_id, f.b_id)
                 and lower(trim(p.name)) = lower(trim(gl.recipient_name))) = 1
       )
     )`;

export async function resolveLinksBetween(
  db: Db,
  a: UserId,
  b: UserId,
  now: number,
): Promise<Resolved[]> {
  const friendship = await friendshipBetween(db, a, b);
  if (friendship?.status === "blocked") return [];
  const nowIso = new Date(now).toISOString();

  const candidates = await db.query<{ id: string }>(
    CANDIDATES,
    [a, b, nowIso, friendship?.status === "accepted"],
  );
  if (candidates.length === 0) return [];
  const ids = candidates.map((c) => c.id);

  await db.query(
    `select 1 from flights where guest_link_id = any($1) and kind = 'delivery'
     order by id for update`,
    [ids],
  );
  const locked = await db.query<{ id: string; sender_id: UserId }>(
    `select id, sender_id from guest_links
     where id = any($1) and status = 'active' and claimed_by is null
     order by id for update`,
    [ids],
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

export async function linksToMyPhone(
  db: Db,
  me: UserId,
): Promise<{ id: string; senderId: UserId }[]> {
  const rows = await db.query<{ id: string; sender_id: UserId }>(
    "select id, sender_id from public.guest_links_for_phone($1)",
    [me],
  );
  return rows.map((r) => ({ id: r.id, senderId: r.sender_id }));
}
