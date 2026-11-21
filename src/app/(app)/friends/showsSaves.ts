import type { FriendRow, Shows } from "@/server/services/friends";
import { saveShows } from "./friendsApi";

type Settled = Awaited<ReturnType<typeof saveShows>>;
type Listener = (id: string, result: Settled) => void;

const queues = new Map<string, { next: Shows | null }>();
const confirmed = new Map<string, { shows: Shows; at: number }>();
const listeners = new Set<Listener>();
let settles = 0;

export function showsSaveCount(): number {
  return settles;
}

export function withShowsSavedSince(
  friends: FriendRow[],
  since: number,
): FriendRow[] {
  return friends.map((f) => {
    const c = confirmed.get(f.id);
    return c && c.at >= since ? { ...f, shows: c.shows } : f;
  });
}

export function onShowsSettled(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function requestShows(
  id: string,
  shows: Shows,
  current: Shows | undefined,
): void {
  const queued = queues.get(id);
  if (queued) {
    queued.next = shows;
    return;
  }
  if (current === undefined || shows === current) return;
  const entry: { next: Shows | null } = { next: null };
  queues.set(id, entry);
  const send = (value: Shows) => {
    void saveShows(id, value).then((r) => {
      if (r.ok) confirmed.set(id, { shows: r.shows, at: settles++ });
      for (const listener of listeners) listener(id, r);
      const { next } = entry;
      entry.next = null;
      if (next !== null && (!r.ok || next !== r.shows)) send(next);
      else queues.delete(id);
    });
  };
  send(shows);
}
