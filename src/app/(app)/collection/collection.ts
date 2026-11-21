import { config } from "@/lib/config";
import type { Collection } from "@/server/services/collection";
import { stampPlace } from "../sill/landedModel";

const TINTS = ["sun", "lilac", "sky", "mint"] as const;

export type Tint = (typeof TINTS)[number];

export type BadgeCard = {
  id: string;
  name: string;
  line: string;
  icon: string;
  tint: Tint;
  earned: boolean;
};

export type BadgesView = { cards: BadgeCard[]; count: string };

type Badge = Collection["badges"][number];

const card = (badge: Badge, index: number): BadgeCard => {
  const earned = badge.earnedAt !== null;
  return {
    id: badge.id,
    name: badge.name,
    line:
      earned || badge.goal <= 1
        ? badge.text
        : `${badge.text}: ${badge.progress} of ${badge.goal}`,
    icon: badge.icon,
    tint: TINTS[index % TINTS.length],
    earned,
  };
};

export function badgesView(badges: Badge[]): BadgesView {
  const cards = badges.map(card);
  const earned = cards.filter((c) => c.earned);
  return {
    cards: [...earned, ...cards.filter((c) => !c.earned)],
    count: `${earned.length} of ${cards.length}`,
  };
}

export type PostmarkSlot =
  | {
      kind: "stamp";
      key: string;
      date: string;
      place: string;
      long: boolean;
      label: string;
      fresh: boolean;
    }
  | { kind: "empty"; key: string };

export type PostmarksView = {
  slots: PostmarkSlot[];
  count: string;
  seen: number;
};

type Earned = Collection["postmarks"][number];

const COLUMNS = 4;
const SHORT_PLACE = 9;

export function postmarksView(
  postmarks: Earned[],
  seenUpTo: number | null,
  timeZone: string,
): PostmarksView {
  const total = config.game.postmarkSlots;
  const short = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
  });
  const long = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "long",
    day: "numeric",
  });
  const stamps: PostmarkSlot[] = postmarks.map((p, i) => {
    const place = stampPlace({ name: p.city, region: p.region });
    const city = p.region === null ? p.city : `${p.city}, ${p.region}`;
    return {
      kind: "stamp",
      key: `stamp-${i}`,
      date: short.format(p.earnedAt).toUpperCase(),
      place,
      long: place.length > SHORT_PLACE,
      label: `Postmark from ${city}, ${long.format(p.earnedAt)}`,
      fresh: seenUpTo !== null && p.earnedAt > seenUpTo,
    };
  });
  const padded = Math.min(
    total,
    Math.ceil(stamps.length / COLUMNS) * COLUMNS + COLUMNS,
  );
  const empties = Array.from(
    { length: Math.max(0, padded - stamps.length) },
    (_, i): PostmarkSlot => ({ kind: "empty", key: `empty-${i}` }),
  );
  return {
    slots: [...stamps, ...empties],
    count: `${stamps.length} of ${total} cities`,
    seen: Math.max(seenUpTo ?? 0, ...postmarks.map((p) => p.earnedAt)),
  };
}

const UNREACHABLE = "We could not reach the post office. Try again.";

type Result<T> = { ok: true; data: T } | { ok: false; message: string };
type Fetch = (input: string) => Promise<Response>;

export async function loadCollection(
  fetchImpl: Fetch = fetch,
): Promise<Result<Collection>> {
  try {
    const res = await fetchImpl("/api/collection");
    const json: unknown = await res.json().catch(() => null);
    if (res.ok && json !== null) return { ok: true, data: json as Collection };
    const message = (json as { error?: { message?: unknown } } | null)?.error
      ?.message;
    return {
      ok: false,
      message: typeof message === "string" && message ? message : UNREACHABLE,
    };
  } catch {
    return { ok: false, message: UNREACHABLE };
  }
}

export async function openCollection(
  load: () => Promise<Result<Collection>>,
  seenUpTo: number | null,
  timeZone: string,
): Promise<
  | { ok: true; postmarks: PostmarksView; badges: BadgesView }
  | { ok: false; message: string }
> {
  const result = await load();
  return result.ok
    ? {
        ok: true,
        postmarks: postmarksView(result.data.postmarks, seenUpTo, timeZone),
        badges: badgesView(result.data.badges),
      }
    : result;
}
