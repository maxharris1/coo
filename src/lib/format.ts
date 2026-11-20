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

export function distance(miles: number, units: Units): string {
  const scale = scales[units];
  const local = miles * scale.perMile;
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
