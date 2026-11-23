import { localDate, minuteOfDay } from "./game/time";
import type { BirdStatus } from "./game/types";

export type Pronoun = "he" | "she" | "they";
export type Units = "mi" | "km";

type PronounForms = { He: string; he: string; him: string; his: string };
type Words = { one: string; many: string };
type Scale = { perMile: number; stepValue: number; step: Words; whole: Words };

const SMALL_BELOW = 0.5;
const STEP = 0.05;

const scales: Record<Units, Scale> = {
  mi: {
    perMile: 1,
    stepValue: 1,
    step: { one: "block", many: "blocks" },
    whole: { one: "mile", many: "miles" },
  },
  km: {
    perMile: 1.609344,
    stepValue: 50,
    step: { one: "metre", many: "metres" },
    whole: { one: "kilometre", many: "kilometres" },
  },
};

const pronouns: Record<Pronoun, PronounForms> = {
  he: { He: "He", he: "he", him: "him", his: "his" },
  she: { He: "She", he: "she", him: "her", his: "her" },
  they: { He: "They", he: "they", him: "them", his: "their" },
};

const pluralVerbs: Record<string, string> = {
  is: "are",
  was: "were",
  has: "have",
  does: "do",
  "isn't": "aren't",
  "wasn't": "weren't",
  "hasn't": "haven't",
  "doesn't": "don't",
};

const TOKEN = /\{(\w+)\}/g;
const SUBJECT_VERB = /(\{[Hh]e\} )([a-z']+)/g;
const SENTENCE_BREAK = /(?<=[.?])\s+/;

export function duration(ms: number): string {
  const clamped = Math.max(0, ms);
  const seconds = Math.round(clamped / 1000);
  if (seconds < 60) return `${seconds} sec`;
  const minutes = Math.round(clamped / 60_000);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

export function asUnits(value: string | undefined): Units {
  return value === "km" ? "km" : "mi";
}

export function inUnits(miles: number, units: Units): number {
  return miles * scales[units].perMile;
}

export function shortDistance(miles: number, units: Units): string {
  const local = inUnits(miles, units);
  if (local < SMALL_BELOW) return distance(miles, units);
  return `${Math.round(local)} ${units}`;
}

export function distance(miles: number, units: Units): string {
  const scale = scales[units];
  const local = inUnits(miles, units);
  const [n, words] =
    local < SMALL_BELOW
      ? [
          (local > 0 ? Math.max(1, Math.round(local / STEP)) : 0) *
            scale.stepValue,
          scale.step,
        ]
      : [Math.round(local), scale.whole];
  return `${n} ${n === 1 ? words.one : words.many}`;
}

const clockFormatters = new Map<string, Intl.DateTimeFormat>();

function clockFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = clockFormatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    clockFormatters.set(timeZone, f);
  }
  return f;
}

export function clockTime(at: Date, timeZone: string): string {
  const p: Record<string, string> = {};
  for (const { type, value } of clockFormatter(timeZone).formatToParts(at)) {
    p[type] = value;
  }
  return `${p.hour}:${p.minute} ${p.dayPeriod.toLowerCase()}`;
}

export type WhenVoice = "live" | "quote";

type Bucket = {
  fromMinute: number;
  today: string;
  tomorrow: string;
  onDay: (day: string) => string;
  dated: string;
};

const WHEN_BUCKETS: readonly Bucket[] = [
  {
    fromMinute: 0,
    today: "overnight",
    tomorrow: "overnight",
    onDay: (day) => `overnight ${day}`,
    dated: "overnight",
  },
  {
    fromMinute: 5 * 60,
    today: "early this morning",
    tomorrow: "early tomorrow morning",
    onDay: (day) => `early ${day} morning`,
    dated: "early in the morning",
  },
  {
    fromMinute: 8 * 60,
    today: "this morning",
    tomorrow: "tomorrow morning",
    onDay: (day) => `${day} morning`,
    dated: "in the morning",
  },
  {
    fromMinute: 11 * 60 + 30,
    today: "around midday",
    tomorrow: "around midday tomorrow",
    onDay: (day) => `around midday ${day}`,
    dated: "around midday",
  },
  {
    fromMinute: 13 * 60 + 30,
    today: "this afternoon",
    tomorrow: "tomorrow afternoon",
    onDay: (day) => `${day} afternoon`,
    dated: "in the afternoon",
  },
  {
    fromMinute: 17 * 60,
    today: "this evening",
    tomorrow: "tomorrow evening",
    onDay: (day) => `${day} evening`,
    dated: "in the evening",
  },
  {
    fromMinute: 20 * 60,
    today: "tonight",
    tomorrow: "tomorrow night",
    onDay: (day) => `${day} night`,
    dated: "at night",
  },
];

const IMMINENT_MS = 10 * 60_000;
const IMMINENT: Record<WhenVoice, string> = {
  live: "any minute now",
  quote: "shortly",
};

const DAY_MS = 86_400_000;
const WEEK_DAYS = 7;

const dayFormatters = new Map<string, Intl.DateTimeFormat>();
const dateFormatters = new Map<string, Intl.DateTimeFormat>();

function cached(
  cache: Map<string, Intl.DateTimeFormat>,
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  let f = cache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone, ...options });
    cache.set(timeZone, f);
  }
  return f;
}

export function fuzzyWhen(
  atMs: number,
  nowMs: number,
  timeZone: string,
  voice: WhenVoice = "live",
): string {
  if (atMs - nowMs <= IMMINENT_MS) return IMMINENT[voice];
  const minute = minuteOfDay(atMs, timeZone);
  const bucket = WHEN_BUCKETS.findLast((b) => b.fromMinute <= minute)!;
  const days =
    (Date.parse(localDate(atMs, timeZone)) -
      Date.parse(localDate(nowMs, timeZone))) /
    DAY_MS;
  if (days === 0) return bucket.today;
  if (days === 1) return bucket.tomorrow;
  if (days < WEEK_DAYS) {
    const day = cached(dayFormatters, timeZone, { weekday: "long" });
    return bucket.onDay(day.format(atMs));
  }
  const date = cached(dateFormatters, timeZone, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  return `${date.format(atMs)}, ${bucket.dated}`;
}

export function pronounTokens(p: Pronoun): PronounForms {
  return pronouns[p];
}

function pluralVerb(verb: string): string {
  if (verb in pluralVerbs) return pluralVerbs[verb];
  if (verb.endsWith("ies")) return `${verb.slice(0, -3)}y`;
  if (/(ch|sh|ss|x|z|o)es$/.test(verb)) return verb.slice(0, -2);
  if (/[^s]s$/.test(verb)) return verb.slice(0, -1);
  return verb;
}

export function fill(
  template: string,
  tokens: Record<string, string | number | undefined>,
  pronoun?: Pronoun,
): string {
  const values: Record<string, string | number | undefined> = {
    ...(pronoun && pronouns[pronoun]),
    ...tokens,
  };
  const agreed =
    pronoun === "they"
      ? template.replace(
          SUBJECT_VERB,
          (_, subject: string, verb: string) => subject + pluralVerb(verb),
        )
      : template;
  return agreed
    .split(SENTENCE_BREAK)
    .filter((sentence) =>
      [...sentence.matchAll(TOKEN)].every(
        ([, name]) => values[name] !== undefined,
      ),
    )
    .map((sentence) =>
      sentence.replace(TOKEN, (_, name: string) => String(values[name])),
    )
    .join(" ");
}

const NUMBER_WORDS = [
  "no",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
];

const AWAY: ReadonlySet<BirdStatus> = new Set(["flying", "visiting"]);

export function isAway(status: BirdStatus): boolean {
  return AWAY.has(status);
}

const hourFormatters = new Map<string, Intl.DateTimeFormat>();

function hourIn(nowMs: number, timeZone: string): number {
  let f = hourFormatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      hourCycle: "h23",
    });
    hourFormatters.set(timeZone, f);
  }
  return Number(f.format(nowMs));
}

function timeOfDay(hour: number): string {
  if (hour >= 5 && hour < 12) return "Morning";
  if (hour >= 12 && hour < 17) return "Afternoon";
  if (hour >= 17 && hour < 22) return "Evening";
  return "Night";
}

function inWords(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

type GreetingBird = { status: BirdStatus; busyKind?: string | null };
type Place = "home" | "flying" | "sill" | "job";

function placeOf({ status, busyKind }: GreetingBird): Place {
  if (status === "flying") return "flying";
  if (status === "visiting") return "sill";
  if (status === "busy" && busyKind === "job") return "job";
  return "home";
}

const AWAY_CLAUSES: readonly [Exclude<Place, "home">, (n: number) => string][] =
  [
    ["flying", (n) => `${inWords(n)} flying`],
    ["sill", (n) => `${inWords(n)} on a sill`],
    [
      "job",
      (n) => (n === 1 ? "one out on a job" : `${inWords(n)} out on jobs`),
    ],
  ];

export function greeting(
  nowMs: number,
  timeZone: string,
  birds: readonly GreetingBird[],
): string {
  const counts = { home: 0, flying: 0, sill: 0, job: 0 };
  for (const bird of birds) counts[placeOf(bird)] += 1;
  const homePart = `${inWords(counts.home)} ${counts.home === 1 ? "bird" : "birds"} home`;
  const awayParts = AWAY_CLAUSES.filter(([place]) => counts[place] > 0).map(
    ([place, clause]) => clause(counts[place]),
  );
  const count =
    birds.length === 0 ? "no birds yet" : [homePart, ...awayParts].join(", ");
  return `${timeOfDay(hourIn(nowMs, timeZone))}. ${capitalise(count)}.`;
}
