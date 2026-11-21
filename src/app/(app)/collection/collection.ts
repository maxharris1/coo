import type { Collection } from "@/server/services/collection";

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
): Promise<{ ok: true; view: BadgesView } | { ok: false; message: string }> {
  const result = await load();
  return result.ok
    ? { ok: true, view: badgesView(result.data.badges) }
    : result;
}
