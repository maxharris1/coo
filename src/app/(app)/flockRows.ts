import type { SyncPayload } from "@/components/sync";
import { clockTime, duration } from "@/lib/format";

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

export type Chip = "Ready" | "Flying" | "Resting" | "Scheduled" | "On a sill";
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

const BUSY: Record<string, string> = {
  nap: "Napping",
  bath: "Bathing",
  job: "On an odd job",
};

export function flockRow(bird: FlockBird, ctx: RowContext): FlockRow {
  const at = (ms: number) => clockTime(new Date(ms), ctx.timezone);
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
          ? `Leaves at ${at(flight.releaseAt)}${recipient ? ` for ${recipient}` : ""}`
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
      const what = BUSY[bird.busyKind ?? ""] ?? "Busy";
      return chip(
        "Resting",
        bird.busyUntil ? `${what} until ${at(bird.busyUntil)}` : what,
        "lilac",
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
      if (bird.tired) {
        return chip("Resting", "Too tired to fly. Resting up.", "lilac");
      }
      return chip("Ready", "Home, fed, smug", "sky");
  }
}

export type PerchSlot = "egg" | "empty";

export function perchSlots(
  birds: number,
  perches: number,
  egg: { status: string } | null,
): PerchSlot[] {
  const free = Math.max(0, perches - birds);
  return Array.from({ length: free }, (_, i) =>
    i === 0 && egg?.status === "ready" ? "egg" : "empty",
  );
}

export type IncomingCard = { id: string; title: string; line: string };

export function incomingCards(
  flights: readonly FlightLite[],
  nowMs: number,
): IncomingCard[] {
  return flights
    .filter((f) => f.role === "incoming" && f.status === "flying")
    .map((f) => ({
      id: f.id,
      title: `Incoming from ${f.owner.name}`,
      line: f.arriveAt
        ? `${f.bird.name} lands on your sill in ${duration(f.arriveAt - nowMs)}`
        : `${f.bird.name} is on the way`,
    }));
}

export async function feedThenRefresh(
  birdId: string,
  feed: (birdId: string) => Promise<void>,
  refresh: () => void,
): Promise<void> {
  await feed(birdId);
  refresh();
}
