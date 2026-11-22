import { config } from "@/lib/config";
import {
  CONFIG,
  positionAt,
  type EventKind,
  type FlightEvent,
  type FlightInput,
  type FlightPlan,
  type WeatherSample,
} from "@/lib/flight/engine";
import { clockTime, fill } from "@/lib/format";
import type { Flight } from "@/server/services/flights/shape";
import styles from "./FlightLog.module.css";

type RoutePlaces = {
  deciles: (string | null)[];
  events: Record<string, string>;
};

const EMPTY: RoutePlaces = { deciles: [], events: {} };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function routePlaces(raw: unknown): RoutePlaces {
  if (!isRecord(raw)) return EMPTY;
  const deciles = Array.isArray(raw.deciles)
    ? raw.deciles.map((name) =>
        typeof name === "string" && name ? name : null,
      )
    : [];
  const events: Record<string, string> = {};
  if (isRecord(raw.events)) {
    for (const [key, name] of Object.entries(raw.events)) {
      if (typeof name === "string" && name) events[key] = name;
    }
  }
  return { deciles, events };
}

export function placeNear(flight: Flight, frac: number): string | undefined {
  const { deciles } = routePlaces(flight.placeNames);
  if (deciles.length === 0) return undefined;
  const clamped = Math.min(1, Math.max(0, frac));
  return deciles[Math.round(clamped * (deciles.length - 1))] ?? undefined;
}

export type LogLine = { atMs: number; kind: EventKind; text: string };

type CopyKey = Exclude<keyof typeof config.copy.flightLog, "_about">;

type WeatherRow = {
  group: "rain" | "snow" | "cold" | "headwind" | "tailwind";
  matches: (sample: WeatherSample, plan: FlightPlan) => boolean;
  geared?: (gear: string[], sample: WeatherSample) => boolean;
};

const headwind = (sample: WeatherSample, plan: FlightPlan) =>
  Math.cos(((sample.windFromDeg - plan.bearingDeg) * Math.PI) / 180) > 0;
const windy = (sample: WeatherSample) =>
  sample.windMph >= config.game.weather.windyMph;

export function metHeadwind(
  input: Pick<FlightInput, "weather">,
  plan: FlightPlan,
): boolean {
  return input.weather.some((s) => windy(s) && headwind(s, plan));
}

const WEATHER: WeatherRow[] = [
  {
    group: "rain",
    matches: (s) => s.precipMmH >= CONFIG.rainMmH,
    geared: (gear, s) =>
      s.precipMmH >= CONFIG.downpourMmH
        ? gear.includes("rainhat")
        : gear.includes("goggles") || gear.includes("rainhat"),
  },
  {
    group: "snow",
    matches: (s) => s.snow,
    geared: (gear) => gear.includes("scarf"),
  },
  {
    group: "cold",
    matches: (s) => s.tempF < CONFIG.coldF,
    geared: (gear) => gear.includes("beanie") || gear.includes("scarf"),
  },
  { group: "headwind", matches: (s, plan) => windy(s) && headwind(s, plan) },
  { group: "tailwind", matches: (s, plan) => windy(s) && !headwind(s, plan) },
];

function weatherKey(flight: Flight, plan: FlightPlan): CopyKey | undefined {
  const input = flight.input;
  if (!input) return undefined;
  for (const row of WEATHER) {
    const sample = input.weather.find((s) => row.matches(s, plan));
    if (!sample) continue;
    const geared = `weather_${row.group}_geared`;
    if (row.geared?.(input.gear, sample) && geared in config.copy.flightLog) {
      return geared as CopyKey;
    }
    return `weather_${row.group}`;
  }
  return undefined;
}

function copyKey(
  event: FlightEvent,
  flight: Flight,
  plan: FlightPlan,
): CopyKey | undefined {
  switch (event.kind) {
    case "takeoff":
      return flight.kind === "return" ? "takeoff_return" : "takeoff";
    case "delay":
      return plan.delayKind === "none" ? undefined : `delay_${plan.delayKind}`;
    case "landing":
      return flight.input?.bird.breed === "tumbler"
        ? "landing_tumbler"
        : "landing";
    case "weather":
      return weatherKey(flight, plan);
    default:
      return event.kind;
  }
}

export function flightLog(flight: Flight, nowMs: number): LogLine[] {
  const plan = flight.plan;
  if (!plan) return [];
  const named = routePlaces(flight.placeNames).events;
  const input = flight.input;
  return plan.events
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => event.atMs <= nowMs)
    .sort((a, b) => b.event.atMs - a.event.atMs)
    .flatMap(({ event, index }) => {
      const key = copyKey(event, flight, plan);
      if (!key) return [];
      const lines = config.copy.flightLog[key];
      const place =
        named[String(index)] ??
        placeNear(
          flight,
          positionAt(plan, flight.from, flight.to, event.atMs).frac,
        );
      const text = fill(lines[event.pick % lines.length], {
        bird: flight.bird.name,
        place,
        speed: input ? `${input.bird.speedMph} mph` : undefined,
        friend: flight.counterpart?.name ?? flight.guestName,
      });
      return text ? [{ atMs: event.atMs, kind: event.kind, text }] : [];
    });
}

export function FlightLog({
  flight,
  nowMs,
  timeZone,
}: {
  flight: Flight;
  nowMs: number;
  timeZone: string;
}) {
  const log = flightLog(flight, nowMs);
  if (log.length === 0) return null;
  return (
    <section className={styles.log}>
      <h2 className={styles.heading}>Flight log</h2>
      <ol className={styles.lines}>
        {log.map((line, i) => (
          <li key={`${line.atMs}-${line.kind}-${i}`} className={styles.line}>
            <time
              className={styles.time}
              dateTime={new Date(line.atMs).toISOString()}
            >
              {clockTime(new Date(line.atMs), timeZone)}
            </time>
            <span>{line.text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
