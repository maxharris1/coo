import { config } from "@/lib/config";
import type { Breed, GearId, Look } from "@/components/Bird";
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

const TONES = ["sky", "sun", "lilac", "peach", "mint"] as const;

export type AvatarTone = (typeof TONES)[number];

export type MetBird = {
  name: string;
  look: Look;
  breed: Breed;
  gear: GearId[];
  tone: AvatarTone;
};

export type BirdsView = { shown: MetBird[]; more: number; count: string };

export function birdsView(
  birdsMet: number,
  birdsMetRecent: Collection["birdsMetRecent"],
): BirdsView {
  return {
    shown: birdsMetRecent.map((b, i) => ({
      name: b.name,
      look: b.look as Look,
      breed: b.breed as Breed,
      gear: b.gear as GearId[],
      tone: TONES[i % TONES.length],
    })),
    more: Math.max(birdsMet - birdsMetRecent.length, 0),
    count: `${birdsMet} met`,
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

type SeenStore = {
  read(account: string): number | null;
  write(account: string, seen: number): void;
};

const seenKey = (account: string) => `coo.postmarks-seen:${account}`;

export function seenStore(
  storage: () => Pick<Storage, "getItem" | "setItem">,
): SeenStore {
  return {
    read(account) {
      try {
        const raw = storage().getItem(seenKey(account));
        const seen = raw === null ? Number.NaN : Number(raw);
        return Number.isFinite(seen) ? seen : null;
      } catch {
        return 0;
      }
    },
    write(account, seen) {
      try {
        storage().setItem(seenKey(account), String(seen));
      } catch {}
    },
  };
}

export async function openCollection(
  load: () => Promise<Result<Collection>>,
  seenUpTo: (account: string) => number | null,
  timeZone: string,
): Promise<
  | {
      ok: true;
      account: string;
      view: { postmarks: PostmarksView; badges: BadgesView; birds: BirdsView };
    }
  | { ok: false; message: string }
> {
  const result = await load();
  if (!result.ok) return result;
  const { account, postmarks, badges, birdsMet, birdsMetRecent } = result.data;
  return {
    ok: true,
    account,
    view: {
      postmarks: postmarksView(postmarks, seenUpTo(account), timeZone),
      badges: badgesView(badges),
      birds: birdsView(birdsMet, birdsMetRecent),
    },
  };
}
