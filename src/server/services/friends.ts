import { fill } from "@/lib/format";
import type { Db } from "@/server/db";
import type { Deps } from "@/server/deps";
import { AppError } from "@/server/errors";
import type { UserId } from "@/server/ports/auth";
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
