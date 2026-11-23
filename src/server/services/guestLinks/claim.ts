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
import { guestIpLimit, NO_SUCH_LINK } from "./get";
import {
  attributeLink,
  lockPeopleAndLinks,
  resolveLinksBetween,
  txLockingLinks,
  type Candidate,
  type Person,
} from "./resolve";

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
  ip: string,
  token: string,
): Promise<ClaimResult> {
  await guestIpLimit(deps, ip);
  const shape = new RegExp(
    `^[A-Za-z0-9]{${deps.config.game.guestLinks.tokenChars}}$`,
  );
  if (!shape.test(token)) throw new AppError("not_found", NO_SUCH_LINK);

  const { result, linkId, notificationId } = await claimTx(
    deps,
    me,
    hashToken(pepper, token),
  );

  if (notificationId) {
    log.info("guest.claimed", { guestLinkId: linkId });
    await deliver(deps, notificationId);
  }
  return result;
}

function claimTx(deps: Deps, me: UserId, tokenHash: string) {
  return txLockingLinks(deps, async (db) => {
    const { link, people, owned } = await lockClaim(
      db,
      tokenHash,
      me,
      deps.clock.now(),
    );
    const now = deps.clock.now();
    const outcome = verdict(link, me, now);
    if (outcome === "gone" || outcome === "conflict") throw REFUSALS[outcome];
    const notificationId =
      outcome === "fresh"
        ? await claim(db, link, people, owned, me, now)
        : null;
    return {
      result: await resultFor(db, link, me, now),
      linkId: link.id,
      notificationId,
    };
  });
}

async function lockClaim(
  db: Db,
  tokenHash: string,
  me: UserId,
  before: number,
) {
  const [found] = await db.query<{ id: string; sender_id: UserId }>(
    "select id, sender_id from guest_links where token_hash = $1",
    [tokenHash],
  );
  if (!found) throw new AppError("not_found", NO_SUCH_LINK);
  const { people, owned } = await lockPeopleAndLinks(
    db,
    me,
    [found.sender_id],
    before,
    [{ id: found.id, other: found.sender_id, pinned: false }],
  );
  const [link] = await db.query<LockedLink>(
    `select id, status, sender_id, claimed_by, expires_at from guest_links
     where id = $1 for update`,
    [found.id],
  );
  if (!link) throw new AppError("not_found", NO_SUCH_LINK);
  return { link, people, owned };
}

async function claim(
  db: Db,
  link: LockedLink,
  people: Person[],
  owned: Candidate[],
  me: UserId,
  now: number,
): Promise<string | null> {
  const nowIso = new Date(now).toISOString();
  const sender = link.sender_id;

  const existing = await friendshipBetween(db, me, sender);
  if (existing?.status === "blocked")
    throw new AppError("forbidden", "You can't claim this link");
  if (!existing)
    await db.query(
      `insert into friendships (a_id, b_id, via, created_at)
       values ($1, $2, 'guest_link', $3)`,
      [...pair(me, sender), nowIso],
    );

  await attributeLink(db, link.id, me, nowIso);
  await db.query(
    `insert into events (user_id, kind, created_at)
     select u, k, $2 from unnest($1::uuid[]) u, unnest(array['friends', 'flight']) k`,
    [[me, sender], nowIso],
  );

  const claimer = people.find((p) => p.id === me);
  if (!claimer) throw new AppError("not_found", "No profile");
  const created = await recordNotification(db, now, {
    userId: sender,
    kind: "friend-joined",
    refId: link.id,
    ...notificationText("friend-joined", { friend: claimer.name }),
  });
  await resolveLinksBetween(db, me, sender, now, owned);
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
