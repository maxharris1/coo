import type { SyncPayload } from "@/components/sync";
import type { Tone } from "../flockRows";

export type MoreSync = Pick<
  SyncPayload,
  "friendsCount" | "egg" | "punchCard"
> & {
  me: { settings: Pick<SyncPayload["me"]["settings"], "quietOn"> };
};

export type MoreSources = {
  sync: MoreSync;
  friends: { invitesOut: number } | null;
  notes: { total: number } | null;
  collection: { postmarks: number; badges: number } | null;
};

export type MoreRow = {
  id: "friends" | "shoebox" | "collection" | "aviary" | "earn" | "settings";
  title: string;
  href:
    "/friends" | "/shoebox" | "/collection" | "/aviary" | "/earn" | "/settings";
  tone: Tone;
  sub: (s: MoreSources) => string | null;
};

const count = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

export const MORE_ROWS: readonly MoreRow[] = [
  {
    id: "friends",
    title: "Friends",
    href: "/friends",
    tone: "sky",
    sub: ({ sync, friends }) =>
      friends &&
      `${count(sync.friendsCount, "friend")}${
        friends.invitesOut ? `, ${count(friends.invitesOut, "invite")} out` : ""
      }`,
  },
  {
    id: "shoebox",
    title: "Shoebox",
    href: "/shoebox",
    tone: "peach",
    sub: ({ notes }) => notes && `${count(notes.total, "note")} saved`,
  },
  {
    id: "collection",
    title: "Collection",
    href: "/collection",
    tone: "lilac",
    sub: ({ collection }) =>
      collection &&
      `${count(collection.postmarks, "postmark")}, ${count(collection.badges, "badge")}`,
  },
  {
    id: "aviary",
    title: "Aviary",
    href: "/aviary",
    tone: "sun",
    sub: ({ sync: { egg } }) =>
      egg &&
      (egg.status === "ready" || egg.deliveriesToGo === 0
        ? "Egg is ready to hatch"
        : `Egg hatches in ${count(egg.deliveriesToGo, "delivery", "deliveries")}`),
  },
  {
    id: "earn",
    title: "Earn seeds",
    href: "/earn",
    tone: "mint",
    sub: ({ sync: { punchCard } }) =>
      `Punch card at ${Math.min(punchCard.deliveries, punchCard.size)} of ${punchCard.size}`,
  },
  {
    id: "settings",
    title: "Settings",
    href: "/settings",
    tone: "sand",
    sub: ({ sync }) =>
      `Quiet hours are ${sync.me.settings.quietOn ? "on" : "off"}`,
  },
];

async function read<T>(
  fetchImpl: typeof fetch,
  path: string,
  parse: (body: unknown) => T | null,
): Promise<T | null> {
  try {
    const res = await fetchImpl(path, { cache: "no-store" });
    return res.ok ? parse(await res.json()) : null;
  } catch {
    return null;
  }
}

const parseFriends = (body: unknown): MoreSources["friends"] => {
  const b = body as { friends?: unknown; guestLinks?: unknown } | null;
  if (!Array.isArray(b?.friends)) return null;
  return { invitesOut: Array.isArray(b.guestLinks) ? b.guestLinks.length : 0 };
};

const parseNotes = (body: unknown): MoreSources["notes"] => {
  const total = (body as { total?: unknown } | null)?.total;
  return typeof total === "number" ? { total } : null;
};

const parseCollection = (body: unknown): MoreSources["collection"] => {
  const b = body as { postmarks?: unknown; badges?: unknown } | null;
  if (!Array.isArray(b?.postmarks) || !Array.isArray(b.badges)) return null;
  const badges = b.badges as { earnedAt: unknown }[];
  return {
    postmarks: b.postmarks.length,
    badges: badges.filter((badge) => badge.earnedAt !== null).length,
  };
};

export async function loadMoreSources(
  sync: MoreSync,
  fetchImpl: typeof fetch = fetch,
): Promise<MoreSources> {
  const [friends, notes, collection] = await Promise.all([
    read(fetchImpl, "/api/friends", parseFriends),
    read(fetchImpl, "/api/notes", parseNotes),
    read(fetchImpl, "/api/collection", parseCollection),
  ]);
  return { sync, friends, notes, collection };
}
