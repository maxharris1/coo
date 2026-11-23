import { clockTime, fuzzyWhen, shortDistance, type Units } from "@/lib/format";
import { localHour } from "@/lib/game/time";
import type { Factor, FactorKind } from "@/server/services/flights/factors";
import type {
  BirdQuote,
  RecipientQuote,
} from "@/server/services/flights/quote";

export type Departure = { at: number; isNow: boolean };

export type HourChip = {
  at: number;
  label: string;
  odds: string;
  roosts: boolean;
  selected: boolean;
};

export type ForecastFactor = {
  kind: FactorKind;
  title: string;
  text: string;
  effect: string;
};

export type ForecastModel = {
  route: string;
  question: string;
  chips: HourChip[];
  selected: { odds: string; heading: string; detail: string };
  factors: ForecastFactor[];
  sunset: string;
  best: { at: number; label: string } | null;
  send: { label: string; releaseAt: number | undefined };
};

const STEP_MS = 15 * 60_000;

const FACTOR_TITLES: Record<FactorKind, string> = {
  headwind: "Headwind",
  tailwind: "Tailwind",
  rain: "Rain",
  downpour: "Downpour",
  cold: "Cold",
  snow: "Snow",
  hawk: "Hawk advisory",
  fair: "Street fair",
  hungry: "Hungry",
  scruffy: "Scruffy",
  tired: "Tired",
  night: "Night flight",
  distance: "Long way",
};

export function departures(
  now: number,
  tz: string,
  hours: readonly number[],
  maxAheadMs: number,
): Departure[] {
  const wanted = new Set(hours);
  const result: Departure[] = [];
  let previous = localHour(now, tz);
  if (wanted.delete(previous)) result.push({ at: now, isNow: true });
  const end = now + maxAheadMs;
  for (
    let at = (Math.floor(now / STEP_MS) + 1) * STEP_MS;
    at <= end;
    at += STEP_MS
  ) {
    const hour = localHour(at, tz);
    if (hour !== previous && wanted.delete(hour))
      result.push({ at, isNow: false });
    previous = hour;
  }
  return result;
}

function hourLabel(at: number, tz: string): string {
  return clockTime(new Date(at), tz).replace(":00", "");
}

function odds(quote: BirdQuote): string {
  return `${Math.round(quote.odds * 100)}%`;
}

function factorText(factor: Factor, units: Units): string {
  return factor.kind === "distance"
    ? `${shortDistance(factor.distanceMi, units)} is a long way`
    : factor.text;
}

function bestQuote(quotes: BirdQuote[], now: number): BirdQuote | null {
  let best: BirdQuote | null = null;
  for (const q of quotes) {
    if (q.roostsOvernight || q.releaseAt <= now) continue;
    if (
      !best ||
      q.odds > best.odds ||
      (q.odds === best.odds && q.releaseAt < best.releaseAt)
    ) {
      best = q;
    }
  }
  return best;
}

function landing(q: BirdQuote, tz: string): string {
  const lands = `Lands ${fuzzyWhen(q.arriveAt, q.releaseAt, tz, "quote")}.`;
  if (q.fliesInDark) return `Flies through the night. ${lands}`;
  return q.leavesAt > q.releaseAt
    ? `Waits for sunrise. Leaves at first light. ${lands}`
    : lands;
}

export function forecastModel(
  leg: RecipientQuote,
  bird: { id: string; name: string },
  selectedAt: number,
  now: number,
  tz: string,
  units: Units,
): ForecastModel {
  const quotes = leg.quotes.filter((q) => q.birdId === bird.id);
  const selected = quotes.find((q) => q.releaseAt === selectedAt) ?? quotes[0];
  const isNow = (q: BirdQuote) => q.releaseAt <= now;
  const selectedNow = isNow(selected);
  const best = bestQuote(quotes, now);
  const switchable = best !== null && best !== selected;
  const day = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone: tz,
  }).format(selected.releaseAt);

  return {
    route: `${leg.from.label} to ${leg.to.label}, ${day}`,
    question: `When should ${bird.name} leave?`,
    chips: quotes.map((q) => ({
      at: q.releaseAt,
      label: isNow(q) ? "Now" : hourLabel(q.releaseAt, tz),
      odds: odds(q),
      roosts: q.roostsOvernight,
      selected: q === selected,
    })),
    selected: {
      odds: odds(selected),
      heading: selectedNow
        ? "Arrival odds leaving now"
        : `Arrival odds leaving at ${clockTime(new Date(selected.releaseAt), tz)}`,
      detail: landing(selected, tz),
    },
    factors: selected.factors.map((f) => ({
      kind: f.kind,
      title: FACTOR_TITLES[f.kind],
      text: factorText(f, units),
      effect: f.effect,
    })),
    sunset: `Sunset is ${clockTime(new Date(selected.sunsetAt), tz)}. ${
      selected.fliesInDark
        ? `With goggles on, ${bird.name} flies on through the dark.`
        : "Birds still out at dusk roost for the night and finish the trip at sunrise."
    }`,
    best: best && {
      at: best.releaseAt,
      label: `Schedule for ${hourLabel(best.releaseAt, tz)}${switchable ? " instead" : ""}`,
    },
    send: selectedNow
      ? { label: "Send now", releaseAt: undefined }
      : {
          label: `Send at ${hourLabel(selected.releaseAt, tz)}${switchable ? " anyway" : ""}`,
          releaseAt: selected.releaseAt,
        },
  };
}
