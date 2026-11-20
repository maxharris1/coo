import { randomBytes } from "node:crypto";
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
