import type { SyncVisit } from "@/server/services/visits/syncRead";
import { distance, duration, type Units } from "@/lib/format";

export type LandedState = "waiting" | "gone";
export type SenderCity = { name: string; region: string | null };

type DelayKind = NonNullable<SyncVisit["flight"]["delayKind"]>;

const MINUTE = 60_000;
const STAMP_MAX = 9;
const STAMP_CLIP = 5;

const delayTails: Record<DelayKind, string> = {
  none: "",
  minor: ", with one snack stop nobody will discuss",
  major: ", the long way round",
};

export function landedState(
  visit: Pick<SyncVisit, "leavesAt">,
  nowMs: number,
): LandedState {
  return nowMs >= visit.leavesAt ? "gone" : "waiting";
}

export function tripSummary(
  visit: SyncVisit,
  city: SenderCity | null,
  units: Units,
): string {
  const from = `From ${visit.owner.name}${city ? ` in ${city.name}` : ""}.`;
  const { distanceMi, durationMs, delayKind } = visit.flight;
  if (distanceMi === null || durationMs === null) return from;
  const tail = delayKind ? delayTails[delayKind] : "";
  return `${from} ${distance(distanceMi, units)} in ${duration(durationMs)}${tail}.`;
}

const stampFormatters = new Map<string, Intl.DateTimeFormat>();

function stampFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = stampFormatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      month: "short",
      day: "2-digit",
    });
    stampFormatters.set(timeZone, f);
  }
  return f;
}

function stampName(name: string): string {
  const upper = name.toUpperCase();
  if (upper.length <= STAMP_MAX) return upper;
  const words = upper.split(/\s+/).filter(Boolean);
  if (words.length > 1) return words.map((w) => w[0]).join("");
  return upper.slice(0, STAMP_CLIP);
}

export function postmark(
  createdAt: number,
  city: SenderCity | null,
  timeZone: string,
): { date: string; place: string | null } {
  const p: Record<string, string> = {};
  for (const { type, value } of stampFormatter(timeZone).formatToParts(
    createdAt,
  )) {
    p[type] = value;
  }
  const date = `${p.month} ${p.day}`.toUpperCase();
  if (!city) return { date, place: null };
  const region = city.region === null ? "" : `, ${city.region.toUpperCase()}`;
  return { date, place: `${stampName(city.name)}${region}` };
}

export function postmarkLabel(
  createdAt: number,
  city: SenderCity | null,
  timeZone: string,
): string {
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "long",
    day: "numeric",
  }).format(createdAt);
  return `Postmark: Pigeon Post${city ? `, ${city.name}` : ""}, ${day}`;
}

export function countdownLine(
  visit: Pick<SyncVisit, "bird" | "leavesAt">,
  nowMs: number,
): string {
  const n = Math.max(1, Math.ceil((visit.leavesAt - nowMs) / MINUTE));
  return `Pigeons only fly home, so replies ride back free. ${visit.bird.name} leaves in ${n} ${n === 1 ? "minute" : "minutes"} with or without one.`;
}
