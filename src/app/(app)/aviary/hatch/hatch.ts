import { config } from "@/lib/config";
import type { Pronoun } from "@/lib/format";
import type { BreedId } from "@/lib/game/types";
import type { BirdView } from "@/server/services/sync";

export type HatchedBird = Pick<
  BirdView,
  "id" | "name" | "pronoun" | "breed" | "look"
>;

export type HatchState =
  | { kind: "naming"; name: string; pronoun: Pronoun; sending: boolean }
  | { kind: "hatched"; bird: HatchedBird };

export type HatchAction =
  | { type: "name"; name: string }
  | { type: "pronoun"; pronoun: Pronoun }
  | { type: "send" }
  | { type: "failed" }
  | { type: "hatched"; bird: HatchedBird };

export const initialHatch: HatchState = {
  kind: "naming",
  name: "",
  pronoun: "they",
  sending: false,
};

export function hatch(state: HatchState, action: HatchAction): HatchState {
  if (state.kind === "hatched") return state;
  switch (action.type) {
    case "name":
      return { ...state, name: action.name };
    case "pronoun":
      return { ...state, pronoun: action.pronoun };
    case "send":
      return { ...state, sending: true };
    case "failed":
      return { ...state, sending: false };
    case "hatched":
      return { kind: "hatched", bird: action.bird };
  }
}

export function breedCard(id: BreedId) {
  const breed = config.breeds.breeds.find((b) => b.id === id)!;
  return { name: breed.name, note: breed.note, trait: breed.trait };
}

const UNREACHABLE = "We could not reach the loft. Try again.";

export async function submitHatch(
  body: { name: string; pronoun: Pronoun },
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; bird: HatchedBird } | { ok: false; message: string }> {
  try {
    const res = await fetchImpl("/api/eggs/hatch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json: unknown = await res.json().catch(() => null);
    if (res.ok) return { ok: true, bird: (json as { bird: HatchedBird }).bird };
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

export async function sendHatch(
  state: HatchState,
  dispatch: (action: HatchAction) => void,
  toast: (message: string) => void,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  if (state.kind !== "naming" || state.sending) return;
  dispatch({ type: "send" });
  const r = await submitHatch(
    { name: state.name.trim(), pronoun: state.pronoun },
    fetchImpl,
  );
  if (r.ok) {
    dispatch({ type: "hatched", bird: r.bird });
  } else {
    dispatch({ type: "failed" });
    toast(r.message);
  }
}
