import type { Db } from "@/server/db";
import type { Deps } from "@/server/deps";
import { AppError } from "@/server/errors";
import { log } from "@/server/log";
import type { UserId } from "@/server/ports/auth";
import { pair } from "@/server/rows";
import { friendshipBetween } from "../friends";
import { notificationText, recordNotification } from "../notify";
import { deliver } from "../notify/deliver";
import { hashToken } from "./create";
import { NO_SUCH_LINK } from "./get";

export type ClaimResult = { friendId: UserId; visitId?: string };

type LockedLink = {
  id: string;
  status: "active" | "claimed" | "expired" | "reported";
  sender_id: UserId;
  claimed_by: UserId | null;
  expires_at: Date | null;
};

type Verdict = "fresh" | "again" | "gone" | "conflict";

const REFUSALS = {
  gone: new AppError("gone", "This link is no longer open"),
  conflict: new AppError("conflict", "This is your own link"),
} as const;

function verdict(link: LockedLink, me: UserId, now: number): Verdict {
  if (link.sender_id === me) return "conflict";
  if (link.status === "claimed" && link.claimed_by === me) return "again";
  if (link.status !== "active") return "gone";
  if (link.expires_at && link.expires_at.getTime() <= now) return "gone";
  return "fresh";
}

export async function claimGuestLink(
  deps: Deps,
  me: UserId,
  pepper: string,
  token: string,
): Promise<ClaimResult> {
  const shape = new RegExp(
    `^[A-Za-z0-9]{${deps.config.game.guestLinks.tokenChars}}$`,
  );
  if (!shape.test(token)) throw new AppError("not_found", NO_SUCH_LINK);
  const now = deps.clock.now();

  const { result, linkId, notificationId } = await deps.db.tx(async (db) => {
    const [link] = await db.query<LockedLink>(
      `select id, status, sender_id, claimed_by, expires_at from guest_links
       where token_hash = $1 for update`,
      [hashToken(pepper, token)],
    );
    if (!link) throw new AppError("not_found", NO_SUCH_LINK);
    const outcome = verdict(link, me, now);
    if (outcome === "gone" || outcome === "conflict") throw REFUSALS[outcome];
    const notificationId =
      outcome === "fresh" ? await claim(db, link, me, now) : null;
    return {
      result: await resultFor(db, link, me, now),
      linkId: link.id,
      notificationId,
    };
  });

  if (notificationId) {
    log.info("guest.claimed", { guestLinkId: linkId });
    await deliver(deps, notificationId);
  }
  return result;
}

async function claim(
  db: Db,
  link: LockedLink,
  me: UserId,
  now: number,
): Promise<string | null> {
  const nowIso = new Date(now).toISOString();
  const sender = link.sender_id;
  const people = await db.query<{ id: string; name: string }>(
    "select id, name from profiles where id = any($1::uuid[]) order by id for update",
    [[me, sender]],
  );

  const existing = await friendshipBetween(db, me, sender);
  if (existing?.status === "blocked")
    throw new AppError("forbidden", "You can't claim this link");
  if (!existing)
    await db.query(
      `insert into friendships (a_id, b_id, via, created_at)
       values ($1, $2, 'guest_link', $3) on conflict do nothing`,
      [...pair(me, sender), nowIso],
    );

  await db.query(
    "update guest_links set status = 'claimed', claimed_by = $2, claimed_at = $3 where id = $1",
    [link.id, me, nowIso],
  );
  const [flight] = await db.query<{ bird_id: string; note_id: string | null }>(
    `update flights set counterpart_id = $2
     where guest_link_id = $1 and kind = 'delivery' returning bird_id, note_id`,
    [link.id, me],
  );
  if (flight.note_id)
    await db.query("update notes set recipient_id = $2 where id = $1", [
      flight.note_id,
      me,
    ]);
  await db.query(
    `update visits set host_id = $2
     where guest_link_id = $1 and status = 'waiting' and leaves_at > $3`,
    [link.id, me, nowIso],
  );
  await db.query(
    `insert into bird_meetings (user_id, bird_id, first_at) values ($1, $2, $3)
     on conflict (user_id, bird_id) do nothing`,
    [me, flight.bird_id, nowIso],
  );
  await db.query(
    `insert into events (user_id, kind, created_at)
     select u, k, $2 from unnest($1::uuid[]) u, unnest(array['friends', 'flight']) k`,
    [[me, sender], nowIso],
  );

  const name = people.find((p) => p.id === me)?.name ?? "";
  const created = await recordNotification(db, now, {
    userId: sender,
    kind: "friend-joined",
    refId: link.id,
    ...notificationText("friend-joined", { friend: name }),
  });
  return created?.id ?? null;
}

async function resultFor(
  db: Db,
  link: LockedLink,
  me: UserId,
  now: number,
): Promise<ClaimResult> {
  const [visit] = await db.query<{ id: string }>(
    `select id from visits
     where guest_link_id = $1 and host_id = $2 and status = 'waiting' and leaves_at > $3`,
    [link.id, me, new Date(now).toISOString()],
  );
  return visit
    ? { friendId: link.sender_id, visitId: visit.id }
    : { friendId: link.sender_id };
}
