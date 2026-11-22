export type ForecastDraft = { friendId: string; birdId: string; body: string };

const key = (friendId: string) => `coo.send.draft.${friendId}`;

export function saveDraft(d: ForecastDraft): void {
  try {
    sessionStorage.setItem(key(d.friendId), JSON.stringify(d));
  } catch {
    return;
  }
}

export function readDraft(friendId: string): ForecastDraft | null {
  try {
    const raw = sessionStorage.getItem(key(friendId));
    const d = raw ? (JSON.parse(raw) as Partial<ForecastDraft>) : null;
    return d &&
      d.friendId === friendId &&
      typeof d.birdId === "string" &&
      typeof d.body === "string"
      ? { friendId, birdId: d.birdId, body: d.body }
      : null;
  } catch {
    return null;
  }
}

export function clearDraft(friendId: string): void {
  try {
    sessionStorage.removeItem(key(friendId));
  } catch {
    return;
  }
}
