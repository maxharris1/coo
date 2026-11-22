import birds from "../../../../../public/assets/data/birds.json";
import type { Look } from "@/components/Bird";
import { sameBirdName } from "@/lib/birdName";
import { config } from "@/lib/config";

export type Pronoun = "he" | "she" | "they";

export const PRONOUNS: readonly { value: Pronoun; label: string }[] = [
  { value: "he", label: "he/him" },
  { value: "she", label: "she/her" },
  { value: "they", label: "they/them" },
];

const isLook = (look: string): look is Look => look in birds;

const city = config.breeds.breeds.find((b) => b.id === "city")!;

export const FIRST_BIRD = {
  looks: config.game.start.looks.filter(isLook).map((look) => ({
    look,
    name: birds[look].name,
  })),
  breed: city.name,
  tags: [
    `${config.game.start.birds[0].speedMph} mph`,
    ...city.note
      .replace(/\.$/, "")
      .split(", ")
      .map((t) => t[0].toUpperCase() + t.slice(1)),
  ],
};

export type FirstBirdState = {
  index: number;
  name: string;
  named: boolean;
  pronoun: Pronoun;
  yourName: string;
  sending: boolean;
  error: string | null;
};

export type FirstBirdAction =
  | { type: "step"; by: 1 | -1 }
  | { type: "rename"; name: string }
  | { type: "shuffle"; pick: number }
  | { type: "pronoun"; pronoun: Pronoun }
  | { type: "yourName"; name: string }
  | { type: "send" }
  | { type: "failed"; message: string }
  | { type: "dismiss" };

export const initialFirstBird = (): FirstBirdState => ({
  index: 0,
  name: FIRST_BIRD.looks[0].name,
  named: false,
  pronoun: "they",
  yourName: "",
  sending: false,
  error: null,
});

export function firstBird(
  state: FirstBirdState,
  action: FirstBirdAction,
): FirstBirdState {
  switch (action.type) {
    case "step": {
      const count = FIRST_BIRD.looks.length;
      const index = (state.index + action.by + count) % count;
      const name = state.named ? state.name : FIRST_BIRD.looks[index].name;
      return { ...state, index, name };
    }
    case "rename":
      return { ...state, name: action.name, named: action.name.trim() !== "" };
    case "shuffle": {
      const others = config.quirks.defaultNames.filter(
        (n) => !sameBirdName(n, state.name),
      );
      const name = others[Math.floor(action.pick * others.length)];
      return { ...state, name, named: true };
    }
    case "pronoun":
      return { ...state, pronoun: action.pronoun };
    case "yourName":
      return { ...state, yourName: action.name };
    case "send":
      return { ...state, sending: true, error: null };
    case "failed":
      return { ...state, sending: false, error: action.message };
    case "dismiss":
      return { ...state, error: null };
  }
}

export type OnboardingBody = {
  name: string;
  timezone: string;
  bird: { name: string; look: Look; pronoun: Pronoun };
};

export const onboardingBody = (
  state: FirstBirdState,
  timezone: string,
): OnboardingBody => ({
  name: state.yourName.trim(),
  timezone,
  bird: {
    name: state.name.trim() || FIRST_BIRD.looks[state.index].name,
    look: FIRST_BIRD.looks[state.index].look,
    pronoun: state.pronoun,
  },
});

const UNREACHABLE = "We could not reach the loft. Try again.";

export async function submitOnboarding(
  body: OnboardingBody,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const res = await fetchImpl("/api/onboarding", {
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
