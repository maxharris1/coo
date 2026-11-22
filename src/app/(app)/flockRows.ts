import type { SyncPayload } from "@/components/sync";
import { clockTime, duration } from "@/lib/format";
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

export type PerchSlot = "roommate" | "egg" | "empty";

export function perchSlots(
  birds: number,
  perches: number,
  egg: { status: string } | null,
): PerchSlot[] {
  const queue: PerchSlot[] = [];
  if (birds > 0 && roommateOwed(birds, perches)) queue.push("roommate");
  if (egg?.status === "ready") queue.push("egg");
  return Array.from(
    { length: Math.max(0, perches - birds) },
    (_, i) => queue[i] ?? "empty",
  );
}

export type IncomingCard = { id: string; title: string; line: string };

export function incomingCards(
  flights: readonly FlightLite[],
  nowMs: number,
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
        ? `${f.bird.name} lands on your sill in ${duration(f.arriveAt - nowMs)}`
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
