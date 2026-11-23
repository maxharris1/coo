import type { SyncPayload } from "@/components/sync";
import { capitalise, fuzzyWhen, inWords, isAway } from "@/lib/format";
import { roommateOwed } from "@/lib/starter";
import type { CannotFly } from "@/server/services/sync";

type FlockBird = SyncPayload["birds"][number];

export type FlightLite = {
  id: string;
  kind: "delivery" | "return";
  status: string;
  role: "mine" | "incoming";
  bird: { id: string; name: string };
  owner: { id: string; name: string };
  counterpart?: { id: string; name: string };
  guestName?: string;
  to: { label: string };
  releaseAt: number;
  arriveAt?: number;
};

export type Visiting = { birdId: string; hostName: string; leavesAt: number };

export type Chip =
  "Ready" | "Flying" | "Resting" | "Scheduled" | "On a sill" | "On a job";
export type Tone = "sky" | "sun" | "lilac" | "peach" | "mint" | "sand";

export type FlockRow = {
  action: { kind: "chip"; chip: Chip } | { kind: "feed" };
  line: string;
  tone: Tone;
};

type RowContext = {
  timezone: string;
  nowMs: number;
  flights: readonly FlightLite[];
  myVisiting: readonly Visiting[];
};

const chip = (c: Chip, line: string, tone: Tone): FlockRow => ({
  action: { kind: "chip", chip: c },
  line,
  tone,
});

type Busy = { label: string; chip: Chip; tone: Tone };

const BUSY: Record<string, Busy> = {
  nap: { label: "Napping", chip: "Resting", tone: "lilac" },
  bath: { label: "Bathing", chip: "Resting", tone: "lilac" },
  job: { label: "On an odd job", chip: "On a job", tone: "sun" },
};

const OTHER_BUSY: Busy = { label: "Busy", chip: "Resting", tone: "lilac" };

const CANNOT_FLY: Record<CannotFly, string> = {
  tired: "Too tired to fly. Resting up.",
  busy: "Busy for now. Can't fly yet.",
  away: "Away from the loft",
};

export function flockRow(bird: FlockBird, ctx: RowContext): FlockRow {
  const at = (ms: number) => fuzzyWhen(ms, ctx.nowMs, ctx.timezone);
  const flight = ctx.flights.find(
    (f) =>
      f.role === "mine" && f.bird.id === bird.id && f.status === bird.status,
  );
  const recipient = flight?.counterpart?.name ?? flight?.guestName;

  switch (bird.status) {
    case "flying": {
      if (!flight) return chip("Flying", "Out on a delivery", "sun");
      const lands = flight.arriveAt
        ? `lands ${at(flight.arriveAt)}`
        : "in the air";
      return chip(
        "Flying",
        flight.kind === "return" || !recipient
          ? `Heading home, ${lands}`
          : `To ${recipient} in ${flight.to.label}, ${lands}`,
        "sun",
      );
    }
    case "scheduled":
      return chip(
        "Scheduled",
        flight
          ? `Leaves ${at(flight.releaseAt)}${recipient ? ` for ${recipient}` : ""}`
          : "Waiting to leave",
        "sand",
      );
    case "visiting": {
      const visit = ctx.myVisiting.find((v) => v.birdId === bird.id);
      return chip(
        "On a sill",
        visit
          ? `On ${visit.hostName}'s sill until ${at(visit.leavesAt)}`
          : "On a friend's sill",
        "mint",
      );
    }
    case "busy": {
      const busy = BUSY[bird.busyKind ?? ""] ?? OTHER_BUSY;
      return chip(
        busy.chip,
        bird.busyUntil
          ? `${busy.label} until ${at(bird.busyUntil)}`
          : busy.label,
        busy.tone,
      );
    }
    case "home":
      if (bird.hungry) {
        return {
          action: { kind: "feed" },
          line: "Hungry. Has opinions about it.",
          tone: "peach",
        };
      }
      if (bird.cannotFlyReason) {
        return chip("Resting", CANNOT_FLY[bird.cannotFlyReason], "lilac");
      }
      if (bird.tired) {
        return chip("Ready", "Home and a bit tired. Can still fly.", "sky");
      }
      return chip("Ready", "Home, fed, smug", "sky");
  }
}

export type PerchSlot = "roommate" | "egg" | "nest" | "empty";

const EGG_SLOT: Record<string, PerchSlot> = {
  ready: "egg",
  incubating: "nest",
};

export function perchSlots(
  birds: number,
  perches: number,
  egg: { status: string } | null,
): PerchSlot[] {
  const queue: PerchSlot[] = [];
  if (birds > 0 && roommateOwed(birds, perches)) queue.push("roommate");
  const eggSlot = egg && EGG_SLOT[egg.status];
  if (eggSlot) queue.push(eggSlot);
  return Array.from(
    { length: Math.max(0, perches - birds) },
    (_, i) => queue[i] ?? "empty",
  );
}

export type Room =
  | { kind: "home"; bird: FlockBird; asleep: boolean }
  | { kind: "away"; bird: FlockBird }
  | { kind: "roommate" }
  | { kind: "egg"; ready: boolean }
  | { kind: "empty" }
  | { kind: "tolet" };

const SLOT_ROOM: Record<PerchSlot, Room> = {
  roommate: { kind: "roommate" },
  egg: { kind: "egg", ready: true },
  nest: { kind: "egg", ready: false },
  empty: { kind: "empty" },
};

function birdRoom(bird: FlockBird): Room {
  if (isAway(bird.status)) return { kind: "away", bird };
  const napping = bird.status === "busy" && bird.busyKind === "nap";
  return { kind: "home", bird, asleep: bird.tired || napping };
}

export function loftRooms(
  birds: readonly FlockBird[],
  perches: number,
  egg: { status: string } | null,
): Room[] {
  return [
    ...birds.map(birdRoom),
    ...perchSlots(birds.length, perches, egg).map((slot) => SLOT_ROOM[slot]),
    ...(perches === 4 ? [{ kind: "tolet" } as const] : []),
  ];
}

type RoomLink = { href: string; label: string };

export const ROOM_LINK: {
  [K in Room["kind"]]: (room: Extract<Room, { kind: K }>) => RoomLink | null;
} = {
  home: ({ bird, asleep }) => ({
    href: `/birds/${bird.id}`,
    label: `${bird.name}, ${asleep ? "asleep" : "at home"}`,
  }),
  away: ({ bird }) => ({
    href: `/birds/${bird.id}`,
    label: `${bird.name}, out`,
  }),
  roommate: () => ({
    href: "/aviary/roommate",
    label: "A roommate is waiting",
  }),
  egg: ({ ready }) => ({
    href: "/aviary",
    label: ready ? "An egg is ready" : "An egg in its nest",
  }),
  empty: () => null,
  tolet: () => ({ href: "/shop", label: "Room to let. Open the shop" }),
};

function names(rooms: readonly Room[]): string[] {
  return rooms.flatMap((r) => ("bird" in r ? [r.bird.name] : []));
}

function joinNames(list: readonly string[]): string {
  return list.length < 2
    ? list.join("")
    : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

function birdsSentence(list: readonly string[], one: string, many: string) {
  return list.length
    ? [`${joinNames(list)} ${list.length === 1 ? one : many}.`]
    : [];
}

function roomsSentence(n: number, rest: string) {
  if (!n) return [];
  return [
    `${capitalise(inWords(n))} ${n === 1 ? "room is" : "rooms are"} ${rest}.`,
  ];
}

export function describeLoft(rooms: readonly Room[]): string {
  const count = (kind: Room["kind"]) =>
    rooms.filter((r) => r.kind === kind).length;
  const home = rooms.filter((r) => r.kind === "home");
  return [
    "Your rooftop loft.",
    ...birdsSentence(
      names(home.filter((r) => !r.asleep)),
      "sits at home",
      "sit at home",
    ),
    ...birdsSentence(
      names(home.filter((r) => r.asleep)),
      "is asleep",
      "are asleep",
    ),
    ...birdsSentence(
      names(rooms.filter((r) => r.kind === "away")),
      "is out",
      "are out",
    ),
    ...roomsSentence(count("empty"), "free"),
    ...roomsSentence(count("tolet"), "to let"),
  ].join(" ");
}

export type IncomingCard = { id: string; title: string; line: string };

export function incomingCards(
  flights: readonly FlightLite[],
  nowMs: number,
  timeZone: string,
): IncomingCard[] {
  return flights
    .filter(
      (f) =>
        f.kind === "delivery" && f.role === "incoming" && f.status === "flying",
    )
    .map((f) => ({
      id: f.id,
      title: `Incoming from ${f.owner.name}`,
      line: f.arriveAt
        ? `${f.bird.name} lands on your sill ${fuzzyWhen(f.arriveAt, nowMs, timeZone)}`
        : `${f.bird.name} is on the way`,
    }));
}

export async function feedThenRefresh(
  birdId: string,
  feed: (birdId: string) => Promise<void>,
  refresh: () => void,
  toast: (message: string) => void,
): Promise<void> {
  try {
    await feed(birdId);
  } catch (err) {
    toast(err instanceof Error ? err.message : String(err));
  } finally {
    refresh();
  }
}
