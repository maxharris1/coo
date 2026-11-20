import birds from "../../../../../public/assets/data/birds.json";
import type { Look } from "@/components/Bird";
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
};

export type FirstBirdAction =
  | { type: "step"; by: 1 | -1 }
  | { type: "rename"; name: string }
  | { type: "shuffle"; pick: number }
  | { type: "pronoun"; pronoun: Pronoun };

export const initialFirstBird = (): FirstBirdState => ({
  index: 0,
  name: FIRST_BIRD.looks[0].name,
  named: false,
  pronoun: "they",
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
      const others = config.quirks.defaultNames.filter((n) => n !== state.name);
      const name = others[Math.floor(action.pick * others.length)];
      return { ...state, name, named: true };
    }
    case "pronoun":
      return { ...state, pronoun: action.pronoun };
  }
}
