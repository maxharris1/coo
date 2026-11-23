import { randomBytes, randomInt } from "node:crypto";
import { z } from "zod";
import { isBlocked } from "@/lib/blocklist";
import type { Config } from "@/lib/config";
import { handleBase } from "@/lib/handle";
import type { Db } from "@/server/db";
import type { Deps } from "@/server/deps";
import { AppError } from "@/server/errors";
import { log } from "@/server/log";
import type { UserId } from "@/server/ports/auth";
import {
  pair,
  toBirdRecord,
  toMe,
  type BirdRecord,
  type Me,
  type Row,
} from "@/server/rows";
import { friendshipBetween } from "./friends";
import {
  linksToMyPhone,
  lockPeopleAndLinks,
  resolveLinksBetween,
  txLockingLinks,
} from "./guestLinks/resolve";
import { notificationText, recordNotification } from "./notify";
import { deliver } from "./notify/deliver";

export type OnboardingResult = { me: Me; birds: BirdRecord[] };

const OUTFIT_NAMES = ["Everyday", "Cold snap", "Fancy"];
const HANDLE = /^[a-z0-9_]{2,20}$/;
const HANDLE_MAX = 20;
const HANDLE_TRIES = 6;

function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const codePointLength = (s: string) => [...s].length;

export const displayName = (max: number) =>
  z
    .string()
    .trim()
    .refine((s) => !s.includes("\u0000"))
    .refine((s) => codePointLength(s) >= 1 && codePointLength(s) <= max)
    .refine((s) => !isBlocked(s));

export const pronoun = z.enum(["he", "she", "they"]);

function schema(config: Config) {
  return z.object({
    name: displayName(30),
    handle: z
      .string()
      .trim()
      .toLowerCase()
      .regex(HANDLE)
      .refine((s) => !isBlocked(s))
      .optional(),
    timezone: z.string().refine(isTimeZone),
    bird: z.object({
      name: displayName(24),
      look: z.string().refine((l) => config.game.start.looks.includes(l)),
      pronoun,
    }),
  });
}

type Body = z.infer<ReturnType<typeof schema>>;

function parse(config: Config, input: unknown): Body {
  const result = schema(config).safeParse(input);
  if (result.success) return result.data;
  const path = result.error.issues[0].path;
  throw new AppError("invalid", path.length > 0 ? path.join(".") : "body");
}

function* handleCandidates(body: Body): Generator<string> {
  const base = handleBase(body.name);
  for (let i = 0; i < HANDLE_TRIES; i++) {
    if (body.handle) yield body.handle;
    else if (i === 0) yield base;
    else {
      const suffix = `_${randomInt(10_000).toString().padStart(4, "0")}`;
      yield base.slice(0, HANDLE_MAX - suffix.length) + suffix;
    }
  }
}

async function claimProfile(
  db: Db,
  user: UserId,
  body: Body,
  now: string,
): Promise<boolean> {
  for (const handle of handleCandidates(body)) {
    const inviteCode = `${handle}-${randomBytes(9).toString("base64url")}`;
    const claimed = await db.query(
      `insert into profiles (id, name, handle, invite_code, timezone, created_at)
       values ($1, $2, $3, $4, $5, $6)
       on conflict do nothing
       returning id`,
      [user, body.name, handle, inviteCode, body.timezone, now],
    );
    if (claimed.length > 0) return true;
    const [{ mine, taken }] = await db.query<{ mine: boolean; taken: boolean }>(
      `select exists (select 1 from profiles where id = $1) as mine,
              exists (select 1 from profiles where handle = $2) as taken`,
      [user, handle],
    );
    if (mine) return false;
    if (taken && body.handle) throw new AppError("conflict", "handle");
  }
  throw new AppError("internal", "Could not find a free handle");
}

export type StarterBird = {
  name: string;
  look: string;
  pronoun: "he" | "she" | "they";
};

export async function insertStarterBird(
  db: Db,
  config: Config,
  owner: UserId,
  bird: StarterBird,
  stats: Config["game"]["start"]["birds"][number],
  now: string,
): Promise<Row<"birds">> {
  const { care } = config.game.start;
  const { fears, loves } = config.quirks;
  const pick = (list: string[]) => list[randomInt(list.length)];
  const [row] = await db.query<Row<"birds">>(
    `insert into birds (owner_id, name, look, pronoun, speed_mph, focus, navigation, quirks,
       belly, feathers, energy, care_at, last_fed_at, hatched_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12, $12)
     returning *`,
    [
      owner,
      bird.name,
      bird.look,
      bird.pronoun,
      stats.speedMph,
      stats.focus,
      stats.navigation,
      [pick(fears), pick(loves)],
      care.belly,
      care.feathers,
      care.energy,
      now,
    ],
  );
  return row;
}

async function stockAccount(
  db: Db,
  config: Config,
  user: UserId,
  body: Body,
  now: string,
): Promise<void> {
  const { start, eggs } = config.game;
  await insertStarterBird(db, config, user, body.bird, start.birds[0], now);
  await db.query(
    "insert into gear_owned (user_id, gear_id, acquired_at) select $1, unnest($2::text[]), $3",
    [user, start.gear, now],
  );
  await db.query(
    "insert into outfits (user_id, name, position) select $1, name, pos - 1 from unnest($2::text[]) with ordinality as o(name, pos)",
    [user, OUTFIT_NAMES],
  );
  await db.query(
    "insert into eggs (user_id, hatch_at_delivery, laid_at) values ($1, $2, $3)",
    [user, eggs.firstAtDeliveries, now],
  );
  await db.query("select apply_seeds($1, $2, 'welcome', $1)", [
    user,
    start.seeds,
  ]);
}

export async function syncPhoneLast4(
  db: Db,
  user: UserId,
): Promise<Row<"profiles"> | null> {
  const [row] = await db.query<Row<"profiles">>(
    "select * from public.sync_phone_last4($1)",
    [user],
  );
  return row ?? null;
}

async function readAccount(db: Db, user: UserId): Promise<OnboardingResult> {
  const [profile] = await db.query<Row<"profiles">>(
    "select * from profiles where id = $1",
    [user],
  );
  const birds = await db.query<Row<"birds">>(
    "select * from birds where owner_id = $1 order by hatched_at, id",
    [user],
  );
  return { me: toMe(profile), birds: birds.map(toBirdRecord) };
}

async function claimSendsToMyPhone(
  db: Db,
  me: UserId,
  now: number,
): Promise<string[]> {
  const links = await linksToMyPhone(db, me);
  const senders = [...new Set(links.map((l) => l.other))];
  if (senders.length === 0) return [];
  const { people, owned } = await lockPeopleAndLinks(
    db,
    me,
    senders,
    now,
    links,
  );
  const joiner = people.find((p) => p.id === me);
  if (!joiner) throw new AppError("not_found", "No profile");
  const nowIso = new Date(now).toISOString();

  const notificationIds: string[] = [];
  for (const sender of senders) {
    const existing = await friendshipBetween(db, me, sender);
    if (existing?.status === "blocked") continue;
    if (!existing)
      await db.query(
        `insert into friendships (a_id, b_id, via, created_at)
         values ($1, $2, 'guest_link', $3)`,
        [...pair(me, sender), nowIso],
      );
    const resolved = await resolveLinksBetween(db, me, sender, now, owned);
    const link = resolved.find((r) => r.senderId === sender);
    if (existing || !link) continue;
    const created = await recordNotification(db, now, {
      userId: sender,
      kind: "friend-joined",
      refId: link.linkId,
      ...notificationText("friend-joined", { friend: joiner.name }),
    });
    if (created) notificationIds.push(created.id);
  }
  return notificationIds;
}

export async function onboard(
  deps: Deps,
  caller: UserId,
  input: unknown,
): Promise<OnboardingResult> {
  const body = parse(deps.config, input);
  const nowMs = deps.clock.now();
  const now = new Date(nowMs).toISOString();
  const { account, notificationIds } = await txLockingLinks(
    deps,
    async (db) => {
      if (await claimProfile(db, caller, body, now)) {
        await stockAccount(db, deps.config, caller, body, now);
      }
      const notificationIds = await claimSendsToMyPhone(db, caller, nowMs);
      // Flights before profiles, as lockPeopleAndLinks takes them, or this deadlocks with joinByCode.
      await syncPhoneLast4(db, caller);
      return { account: await readAccount(db, caller), notificationIds };
    },
  );
  for (const id of notificationIds) await deliverQuietly(deps, id);
  return account;
}

async function deliverQuietly(
  deps: Deps,
  notificationId: string,
): Promise<void> {
  try {
    await deliver(deps, notificationId);
  } catch (error) {
    log.error("onboard.notify_failed", {
      notificationId,
      error: error instanceof Error ? error.name : typeof error,
    });
  }
}
