import birds from "../../../../../public/assets/data/birds.json";
import type { Look } from "@/components/Bird";
import { freeBirdName } from "@/lib/birdName";
import { config } from "@/lib/config";
import type { Pronoun } from "@/lib/format";
import { nextStarterLook, roommateOwed } from "@/lib/starter";

export type RoommateState =
  | { kind: "none" }
  | {
      kind: "naming";
      first: string;
      look: Look;
      name: string;
      pronoun: Pronoun;
      edited: boolean;
      sending: boolean;
    };

type Flock = readonly { name: string; look: string }[];

export type RoommateAction =
  | { type: "name"; name: string }
  | { type: "pronoun"; pronoun: Pronoun }
  | { type: "send" }
  | { type: "failed" }
  | { type: "sync"; flock: Flock; perches: number };

export const lookName = (look: Look): string => birds[look].name;

export function initialRoommate(flock: Flock, perches: number): RoommateState {
  const [first] = flock;
  if (!first || !roommateOwed(flock.length, perches)) return { kind: "none" };
  const look = nextStarterLook(first.look) as Look;
  return {
    kind: "naming",
    first: first.name,
    look,
    name: freeBirdName(
      lookName(look),
      flock.map((b) => b.name),
      config.quirks.defaultNames,
    ),
    pronoun: "they",
    edited: false,
    sending: false,
  };
}

function synced(
  state: RoommateState,
  flock: Flock,
  perches: number,
): RoommateState {
  const next = initialRoommate(flock, perches);
  if (next.kind === "none" || state.kind === "none") return next;
  return {
    ...next,
    pronoun: state.pronoun,
    ...(state.edited && { name: state.name, edited: true }),
  };
}

export function roommate(
  state: RoommateState,
  action: RoommateAction,
): RoommateState {
  if (action.type === "sync") {
    return synced(state, action.flock, action.perches);
  }
  if (state.kind === "none") return state;
  switch (action.type) {
    case "name":
      return { ...state, name: action.name, edited: true };
    case "pronoun":
      return { ...state, pronoun: action.pronoun };
    case "send":
      return { ...state, sending: true };
    case "failed":
      return { ...state, sending: false };
  }
}

const UNREACHABLE = "We could not reach the loft. Try again.";

export async function submitRoommate(
  body: { name: string; pronoun: Pronoun },
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const res = await fetchImpl("/api/birds/roommate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) return { ok: true };
    const json: unknown = await res.json().catch(() => null);
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

export async function sendRoommate(
  state: RoommateState,
  dispatch: (action: RoommateAction) => void,
  toast: (message: string) => void,
  onAdopted: () => void,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  if (state.kind !== "naming" || state.sending) return;
  dispatch({ type: "send" });
  const r = await submitRoommate(
    { name: state.name.trim(), pronoun: state.pronoun },
    fetchImpl,
  );
  if (r.ok) {
    onAdopted();
  } else {
    dispatch({ type: "failed" });
    toast(r.message);
  }
}
