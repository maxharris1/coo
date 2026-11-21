import type { Pose } from "@/components/Bird";
import type { SyncPayload } from "@/components/sync";
import { config } from "@/lib/config";
import { positionAt, type BirdPosition } from "@/lib/flight/engine";
import { fill, type Pronoun } from "@/lib/format";
import type { CareAction } from "@/server/services/care";

type PigeonBird = SyncPayload["birds"][number];

type Trip = BirdPosition["state"] | null;

export function tripOf(
  bird: PigeonBird,
  data: Pick<SyncPayload, "flights" | "serverNow">,
): Trip {
  const flight = data.flights.find(
    (f) => f.bird.id === bird.id && f.status === "flying",
  );
  if (!flight?.plan) return null;
  return positionAt(flight.plan, flight.from, flight.to, data.serverNow).state;
}

type Mood =
  | "fine"
  | "hungry"
  | "sulking"
  | "scruffy"
  | "tired"
  | "grounded"
  | "napping"
  | "bathing"
  | "working"
  | "flying"
  | "roosting"
  | "visiting"
  | "scheduled";

const BUSY_MOOD: Record<string, Mood> = { nap: "napping", bath: "bathing" };

function moodOf(bird: PigeonBird, trip: Trip): Mood {
  switch (bird.status) {
    case "flying":
      return trip === "roosting" ? "roosting" : "flying";
    case "visiting":
    case "scheduled":
      return bird.status;
    case "busy":
      return BUSY_MOOD[bird.busyKind ?? ""] ?? "working";
    case "home":
      if (bird.sulking) return "sulking";
      if (bird.hungry) return "hungry";
      if (bird.scruffy) return "scruffy";
      if (bird.tired) return bird.canFly ? "tired" : "grounded";
      return "fine";
  }
}

const POSE: Record<Mood, Pose> = {
  fine: "perched",
  hungry: "surprise",
  sulking: "sulk",
  scruffy: "perched",
  tired: "perched",
  grounded: "perched",
  napping: "sleep",
  bathing: "perched",
  working: "perched",
  flying: "fly",
  roosting: "sleep",
  visiting: "landed",
  scheduled: "perched",
};

const MOOD_LINE: Record<Mood, string> = {
  fine: "Feeling smug. Fed, preened and ready to fly.",
  hungry: "Hungry. Has opinions about it.",
  sulking: "Sulking. Has not been fed in days and is keeping count.",
  scruffy: "A bit scruffy. A bath would help {his} dignity.",
  tired: "A bit tired. {He} can still fly, but a nap would help.",
  grounded: "Too tired to fly. {He} needs a nap first.",
  napping: "Asleep. Snoring, but with dignity.",
  bathing: "In the bath. Splashing more than strictly necessary.",
  working: "On an odd job. Very professional about it.",
  flying: "Out on a delivery. Taking it very seriously.",
  roosting: "Roosting for the night. Back in the air at first light.",
  visiting: "On a friend's sill. Being polite about the crumbs.",
  scheduled: "Packed and waiting to leave. Pretending not to be excited.",
};

const pronounOf = (bird: PigeonBird) => bird.pronoun as Pronoun;

export const poseFor = (bird: PigeonBird, trip: Trip = null): Pose =>
  POSE[moodOf(bird, trip)];

export const moodLine = (bird: PigeonBird, trip: Trip = null): string =>
  fill(MOOD_LINE[moodOf(bird, trip)], {}, pronounOf(bird));

const PRONOUN_LINES: Record<
  Pronoun,
  { closet: string; doing: string; sulk: string }
> = {
  he: {
    closet: "Open his closet",
    doing: "How he's doing",
    sulk: "Skip a few days and he sulks and flies slower. He never leaves.",
  },
  she: {
    closet: "Open her closet",
    doing: "How she's doing",
    sulk: "Skip a few days and she sulks and flies slower. She never leaves.",
  },
  they: {
    closet: "Open their closet",
    doing: "How they're doing",
    sulk: "Skip a few days and they sulk and fly slower. They never leave.",
  },
};

export const pronounLines = (bird: PigeonBird) =>
  PRONOUN_LINES[pronounOf(bird)];

const breedNames = new Map(
  config.breeds.breeds.map((b) => [b.id, b.name.toLowerCase()]),
);

export const levelLine = (bird: PigeonBird) =>
  `Level ${bird.level} ${breedNames.get(bird.breed)}`;

const { full, meterLowBelow } = config.game.care;

const METERS: readonly {
  action: CareAction;
  label: string;
  value: "belly" | "feathers" | "energy";
  measure: string;
  primary: boolean;
  button: string;
}[] = [
  {
    action: "feed",
    label: "Belly",
    value: "belly",
    measure: "percent full",
    primary: true,
    button: "Feed",
  },
  {
    action: "bath",
    label: "Feathers",
    value: "feathers",
    measure: "percent clean",
    primary: true,
    button: "Bath",
  },
  {
    action: "nap",
    label: "Energy",
    value: "energy",
    measure: "percent",
    primary: false,
    button: "Nap",
  },
];

export const metersFor = (bird: PigeonBird) =>
  METERS.map((m) => {
    const percent = Math.round((bird[m.value] / full) * 100);
    return {
      ...m,
      percent,
      ariaLabel: `${m.label} ${percent} ${m.measure}`,
      low: bird[m.value] < meterLowBelow,
    };
  });
