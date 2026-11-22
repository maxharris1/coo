import {
  distance,
  duration,
  pronounTokens,
  type Pronoun,
  type Units,
} from "@/lib/format";
import { noteLimit, type Doodle } from "@/lib/game/notes";
import type { FriendRow } from "@/server/services/friends";
import type { SyncVisit } from "@/server/services/visits/syncRead";
import { sharedCity } from "../../landedModel";

export type ReplyModel = {
  title: string;
  heading: string;
  route: string;
  speed: string;
  wroteLabel: string;
  note: string;
  doodle: Doodle | null;
  limit: number;
  wait: string;
  release: string;
  composeHref: string;
};

export type Counter = { label: string; over: boolean };

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function routeLine(
  visit: SyncVisit,
  friend: FriendRow | undefined,
  units: Units,
): string {
  const city = sharedCity(friend)?.name;
  const miles = visit.returnMi;
  if (miles === null) return city ? `${city}.` : "";
  const far = distance(miles, units);
  const pace = duration((miles / visit.bird.speedMph) * HOUR);
  const his = pronounTokens(visit.bird.pronoun).his;
  return `${city ? `${city}, ${far}` : far}. About ${pace} at ${his} pace.`;
}

function waitLine(pronoun: Pronoun, minutesLeft: number): string {
  const plural = pronoun === "they";
  const minutes = minutesLeft === 1 ? "minute" : "minutes";
  return `${pronounTokens(pronoun).He} ${plural ? "wait" : "waits"} ${minutesLeft} more ${minutes}, then ${plural ? "head" : "heads"} home with or without a reply.`;
}

export function replyModel(
  visit: SyncVisit,
  friend: FriendRow | undefined,
  nowMs: number,
  units: Units,
): ReplyModel {
  const { bird, owner } = visit;
  const minutesLeft = Math.max(1, Math.ceil((visit.leavesAt - nowMs) / MINUTE));
  return {
    title: `Reply to ${owner.name}`,
    heading: `${bird.name} flies home to ${owner.name}`,
    route: routeLine(visit, friend, units),
    speed: `${Math.round(bird.speedMph)} mph`,
    wroteLabel: `${owner.name} wrote`,
    note: visit.note.body,
    doodle: visit.note.doodle,
    limit: noteLimit(bird),
    wait: waitLine(bird.pronoun, minutesLeft),
    release: `Send ${bird.name} home`,
    composeHref: `/send/write?to=${encodeURIComponent(owner.id)}`,
  };
}

export function counter(text: string, limit: number): Counter {
  const length = [...text.trim()].length;
  return { label: `${length} of ${limit} characters`, over: length > limit };
}

export function canSend(
  note: string,
  doodle: Doodle | null,
  count: Counter,
): boolean {
  return (note.trim() !== "" || doodle !== null) && !count.over;
}
