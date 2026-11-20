import { createHash, randomBytes } from "node:crypto";
import { haversineMi } from "@/lib/flight/engine";
import { fill } from "@/lib/format";
import {
  activeLoft,
  endpointFor,
  type Loft,
  type LoftProfile,
} from "@/lib/game/privacy";
import type { Db } from "@/server/db";
import type { Deps } from "@/server/deps";
import { AppError } from "@/server/errors";
import type { UserId } from "@/server/ports/auth";
import { rateLimit } from "@/server/rateLimit";
import { pair, type Row } from "@/server/rows";

export type Shows = "block" | "city";

export type Friendship = {
  status: "accepted" | "blocked";
  blockedBy: UserId | null;
  myShows: Shows;
  theirShows: Shows;
};

export async function friendshipBetween(
  db: Db,
  me: UserId,
  them: UserId,
): Promise<Friendship | null> {
  const [a, b] = pair(me, them);
  const [row] = await db.query<Row<"friendships">>(
    "select * from friendships where a_id = $1 and b_id = $2",
    [a, b],
  );
  if (!row) return null;
  const [mine, theirs] =
    me === a ? [row.a_shows, row.b_shows] : [row.b_shows, row.a_shows];
  return {
    status: row.status as Friendship["status"],
    blockedBy: row.blocked_by as UserId | null,
    myShows: mine as Shows,
    theirShows: theirs as Shows,
  };
}

export async function inviterFor(
  db: Db,
  code: string,
): Promise<{ name: string }> {
  const [row] = await db.query<Pick<Row<"profiles">, "name">>(
    "select name from profiles where invite_code = $1",
    [code],
  );
  if (!row) throw new AppError("not_found", "No one has that code");
  return { name: row.name };
}

export async function resetInvite(
  deps: Deps,
  me: UserId,
): Promise<{ inviteCode: string }> {
  const [row] = await deps.db.query<Pick<Row<"profiles">, "invite_code">>(
    "update profiles set invite_code = handle || '-' || $2 where id = $1 returning invite_code",
    [me, randomBytes(9).toString("base64url")],
  );
  if (!row) throw new AppError("not_found", "No profile");
  return { inviteCode: row.invite_code };
}

export async function joinByCode(
  deps: Deps,
  me: UserId,
  code: string,
): Promise<{ friend: { id: UserId; name: string; handle: string } }> {
  const now = new Date(deps.clock.now()).toISOString();
  return deps.db.tx(async (db) => {
    const [inviter] = await db.query<
      Pick<Row<"profiles">, "id" | "name" | "handle">
    >("select id, name, handle from profiles where invite_code = $1", [code]);
    if (!inviter) throw new AppError("not_found", "No one has that code");
    const friend = {
      id: inviter.id as UserId,
      name: inviter.name,
      handle: inviter.handle,
    };
    if (friend.id === me)
      throw new AppError("invalid", "That is your own code");

    const locked = await db.query<Pick<Row<"profiles">, "id" | "name">>(
      "select id, name from profiles where id = any($1::uuid[]) order by id for update",
      [[me, friend.id]],
    );

    const existing = await friendshipBetween(db, me, friend.id);
    if (existing?.status === "blocked")
      throw new AppError("conflict", "You can't join this person");
    if (existing) return { friend };

    const max = deps.config.game.limits.friendsMax;
    const full = await db.query<{ id: string }>(
      `select u.id from unnest($1::uuid[]) as u (id)
       join friendships f on f.status = 'accepted' and u.id in (f.a_id, f.b_id)
       group by u.id having count(*) >= $2`,
      [[me, friend.id], max],
    );
    if (full.some((p) => p.id === me))
      throw new AppError("rate_limited", `You already have ${max} friends`);
    if (full.length)
      throw new AppError(
        "rate_limited",
        `${friend.name} already has ${max} friends`,
      );

    const [a, b] = pair(me, friend.id);
    await db.query(
      "insert into friendships (a_id, b_id, created_at) values ($1, $2, $3) on conflict do nothing",
      [a, b, now],
    );

    const joiner = locked.find((p) => p.id === me);
    const copy = deps.config.copy.notifications["friend-joined"];
    await db.query(
      `insert into notifications (user_id, kind, title, body, url, ref_id, created_at)
       values ($1, 'friend-joined', $2, $3, $4, $5, $6)
       on conflict (user_id, kind, ref_id) where ref_id is not null do nothing`,
      [
        friend.id,
        fill(copy.title, { friend: joiner?.name }),
        copy.body,
        copy.url,
        me,
        now,
      ],
    );
    await db.query(
      "insert into events (user_id, kind, created_at) select unnest($1::uuid[]), 'friends', $2",
      [[me, friend.id], now],
    );
    return { friend };
  });
}

const SET_SHOWS = {
  a: "update friendships set a_shows = $3 where a_id = $1 and b_id = $2",
  b: "update friendships set b_shows = $3 where a_id = $1 and b_id = $2",
} as const;

export async function setShows(
  deps: Deps,
  me: UserId,
  them: UserId,
  shows: Shows,
): Promise<{
  friend: {
    id: UserId;
    name: string;
    handle: string;
    shows: Shows;
    theyShow: Shows;
  };
}> {
  const now = new Date(deps.clock.now()).toISOString();
  return deps.db.tx(async (db) => {
    const existing = await friendshipBetween(db, me, them);
    if (existing?.status !== "accepted")
      throw new AppError("not_found", "No such friend");

    const [a, b] = pair(me, them);
    await db.query(SET_SHOWS[me === a ? "a" : "b"], [a, b, shows]);
    await db.query(
      "insert into events (user_id, kind, created_at) values ($1, 'friends', $2)",
      [them, now],
    );
    const [profile] = await db.query<Pick<Row<"profiles">, "name" | "handle">>(
      "select name, handle from profiles where id = $1",
      [them],
    );
    return {
      friend: {
        id: them,
        name: profile.name,
        handle: profile.handle,
        shows,
        theyShow: existing.theirShows,
      },
    };
  });
}

type Place = Loft & { label: string; city: string };

const LOFT_COLUMNS = [
  "travel_on",
  "home_lat",
  "home_lon",
  "home_label",
  "home_city",
  "home_city_lat",
  "home_city_lon",
  "travel_lat",
  "travel_lon",
  "travel_label",
  "travel_city",
  "travel_city_lat",
  "travel_city_lon",
] as const;

type LoftColumns = Pick<Row<"profiles">, (typeof LOFT_COLUMNS)[number]>;

function place(
  lat: number | null,
  lon: number | null,
  label: string | null,
  city: string | null,
  cityLat: number | null,
  cityLon: number | null,
): Place | null {
  if (lat === null || lon === null || label === null || city === null)
    return null;
  return {
    roost: { lat, lon },
    cityCentre:
      cityLat === null || cityLon === null
        ? null
        : { lat: cityLat, lon: cityLon },
    label,
    city,
  };
}

function loftsOf(r: LoftColumns): LoftProfile<Place> {
  return {
    travelOn: r.travel_on,
    home: place(
      r.home_lat,
      r.home_lon,
      r.home_label,
      r.home_city,
      r.home_city_lat,
      r.home_city_lon,
    ),
    travel: place(
      r.travel_lat,
      r.travel_lon,
      r.travel_label,
      r.travel_city,
      r.travel_city_lat,
      r.travel_city_lon,
    ),
  };
}

export type FriendRow = {
  id: UserId;
  name: string;
  handle: string;
  shows: Shows;
  theyShow: Shows;
  where: string | null;
  distanceMi: number | null;
};

export type WaitingGuestLink = { id: string; name: string; where: string };

const LOFT_SELECT = LOFT_COLUMNS.map((c) => `p.${c}`).join(", ");

export async function listFriends(
  deps: Deps,
  me: UserId,
): Promise<{ friends: FriendRow[]; guestLinks: WaitingGuestLink[] }> {
  const [mine] = await deps.db.query<LoftColumns>(
    `select ${LOFT_SELECT} from profiles p where p.id = $1`,
    [me],
  );
  const from = activeLoft(loftsOf(mine));

  const rows = await deps.db.query<
    LoftColumns &
      Pick<Row<"profiles">, "id" | "name" | "handle"> & {
        my_shows: Shows;
        their_shows: Shows;
      }
  >(
    `select p.id, p.name, p.handle, ${LOFT_SELECT},
       case when f.a_id = $1 then f.a_shows else f.b_shows end as my_shows,
       case when f.a_id = $1 then f.b_shows else f.a_shows end as their_shows
     from friendships f
     join profiles p on p.id = case when f.a_id = $1 then f.b_id else f.a_id end
     where f.status = 'accepted' and $1 in (f.a_id, f.b_id)
     order by p.name, p.id`,
    [me],
  );

  const friends = rows.map((r): FriendRow => {
    const lofts = loftsOf(r);
    const loft = activeLoft(lofts);
    const point = endpointFor(r.their_shows, lofts);
    return {
      id: r.id as UserId,
      name: r.name,
      handle: r.handle,
      shows: r.my_shows,
      theyShow: r.their_shows,
      where: loft && (r.their_shows === "city" ? loft.city : loft.label),
      distanceMi:
        from && point
          ? Math.round(haversineMi(from.roost, point) * 10) / 10
          : null,
    };
  });

  const guestLinks = await deps.db.query<WaitingGuestLink>(
    `select id, recipient_name as name, dest_label as "where"
     from guest_links
     where sender_id = $1 and status = 'active'
     order by created_at, id`,
    [me],
  );

  return { friends, guestLinks };
}

export type ReportTarget = { userId: UserId } | { guestLinkToken: string };

export async function report(
  deps: Deps,
  me: UserId,
  target: ReportTarget,
  reason: string,
  pepper: string,
): Promise<Record<string, never>> {
  await rateLimit(
    deps.db,
    deps.clock,
    `reports:${me}`,
    deps.config.game.limits.reportsPerDay,
    86400,
  );
  const now = new Date(deps.clock.now()).toISOString();

  if ("userId" in target) {
    if (!(await friendshipBetween(deps.db, me, target.userId)))
      throw new AppError("not_found", "No one to report");
    await deps.db.query(
      "insert into reports (reporter_id, target_user_id, reason, created_at) values ($1, $2, $3, $4)",
      [me, target.userId, reason, now],
    );
    return {};
  }

  const tokenHash = createHash("sha256")
    .update(pepper + target.guestLinkToken)
    .digest("hex");
  const filed = await deps.db.query(
    `insert into reports (reporter_id, guest_link_id, reason, created_at)
     select $1, id, $3, $4 from guest_links where token_hash = $2
     returning id`,
    [me, tokenHash, reason, now],
  );
  if (filed.length === 0) throw new AppError("not_found", "No such link");
  return {};
}
