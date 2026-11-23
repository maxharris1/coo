import {
  CONFIG,
  computeFlightPlan,
  fliesInDark,
  haversineMi,
  onTimeOdds,
  type BirdState,
  type FlightInput,
  type FlightPlan,
  type WeatherSample,
} from "@/lib/flight/engine";

export type FactorKind =
  | "headwind"
  | "tailwind"
  | "rain"
  | "downpour"
  | "cold"
  | "snow"
  | "hawk"
  | "fair"
  | "hungry"
  | "scruffy"
  | "tired"
  | "night"
  | "distance";

export type Factor =
  | { kind: Exclude<FactorKind, "distance">; text: string; effect: string }
  | { kind: "distance"; distanceMi: number; effect: string };

type Measure = "time" | "odds";

type FactorDef = {
  kind: Exclude<FactorKind, "headwind" | "tailwind" | "distance"> | "wind";
  measure: Measure;
  without: (input: FlightInput) => FlightInput;
  text: (input: FlightInput) => string;
};

const MEASURES: Record<
  Measure,
  {
    delta: (plan: FlightPlan, without: FlightInput, inDark: boolean) => number;
    format: (n: number) => string;
  }
> = {
  time: {
    delta: (plan, without) =>
      Math.round(
        (plan.arriveAtMs - computeFlightPlan(without).arriveAtMs) / 60_000,
      ),
    format: (n) => `${n > 0 ? "+" : "-"}${Math.abs(n)} min`,
  },
  odds: {
    delta: (plan, without, inDark) =>
      Math.round(
        (onTimeOdds(without, haversineMi(without.from, without.to), inDark) -
          plan.onTimeOdds) *
          100,
      ),
    format: (n) => `${n}% off`,
  },
};

const COMPASS = [
  "north",
  "northeast",
  "east",
  "southeast",
  "south",
  "southwest",
  "west",
  "northwest",
];

const eachThird = (
  input: FlightInput,
  change: (w: WeatherSample) => Partial<WeatherSample>,
): FlightInput => ({
  ...input,
  weather: input.weather.map((w) => ({
    ...w,
    ...change(w),
  })) as FlightInput["weather"],
});

const withBird = (
  input: FlightInput,
  bird: Partial<BirdState>,
): FlightInput => ({
  ...input,
  bird: { ...input.bird, ...bird },
});

const withHazards = (
  input: FlightInput,
  hazards: FlightInput["hazards"],
): FlightInput => ({ ...input, hazards: { ...input.hazards, ...hazards } });

function strongestWind(input: FlightInput): WeatherSample {
  return input.weather.reduce((a, b) => (b.windMph > a.windMph ? b : a));
}

const DEFS: FactorDef[] = [
  {
    kind: "wind",
    measure: "time",
    without: (input) => eachThird(input, () => ({ windMph: 0 })),
    text: (input) => {
      const w = strongestWind(input);
      const compass = COMPASS[Math.round(w.windFromDeg / 45) % 8];
      return `${Math.round(w.windMph)} mph from the ${compass}`;
    },
  },
  {
    kind: "downpour",
    measure: "time",
    without: (input) =>
      eachThird(input, (w) => ({
        precipMmH: Math.min(w.precipMmH, CONFIG.rainMmH),
      })),
    text: () => "Heavy rain along the route",
  },
  {
    kind: "cold",
    measure: "time",
    without: (input) =>
      eachThird(input, (w) => ({ tempF: Math.max(w.tempF, CONFIG.coldF) })),
    text: (input) =>
      `${Math.round(Math.min(...input.weather.map((w) => w.tempF)))}°F along the route`,
  },
  {
    kind: "snow",
    measure: "time",
    without: (input) => eachThird(input, () => ({ snow: false })),
    text: () => "Snow along the route",
  },
  {
    kind: "rain",
    measure: "odds",
    without: (input) => eachThird(input, () => ({ precipMmH: 0 })),
    text: () => "Light rain along the route",
  },
  {
    kind: "hawk",
    measure: "odds",
    without: (input) => withHazards(input, { hawk: false }),
    text: () => "Hawks spotted along the route",
  },
  {
    kind: "fair",
    measure: "odds",
    without: (input) => withHazards(input, { fair: false }),
    text: () => "Street fair along the route",
  },
  {
    kind: "hungry",
    measure: "odds",
    without: (input) => withBird(input, { belly: CONFIG.hungryBelow }),
    text: () => "Belly is low",
  },
  {
    kind: "scruffy",
    measure: "odds",
    without: (input) => withBird(input, { feathers: CONFIG.dirtyBelow }),
    text: () => "Feathers need a bath",
  },
  {
    kind: "tired",
    measure: "odds",
    without: (input) => withBird(input, { energy: CONFIG.tiredBelow }),
    text: () => "Energy is low",
  },
];

function distanceFactor(
  input: FlightInput,
  plan: FlightPlan,
  inDark: boolean,
): Factor[] {
  const odds = MEASURES.odds;
  const n = odds.delta(plan, { ...input, to: input.from }, inDark);
  if (n === 0) return [];
  return [
    {
      kind: "distance",
      distanceMi: haversineMi(input.from, input.to),
      effect: odds.format(n),
    },
  ];
}

function nightFactor(
  input: FlightInput,
  plan: FlightPlan,
  inDark: boolean,
): Factor[] {
  const odds = MEASURES.odds;
  const n = inDark ? odds.delta(plan, input, false) : 0;
  if (n === 0) return [];
  return [
    { kind: "night", text: "Flying in the dark", effect: odds.format(n) },
  ];
}

export function factorsFor(input: FlightInput, plan: FlightPlan): Factor[] {
  const inDark = fliesInDark(input);
  const named: Factor[] = DEFS.flatMap((def) => {
    const measure = MEASURES[def.measure];
    const n = measure.delta(plan, def.without(input), inDark);
    if (n === 0) return [];
    const kind =
      def.kind !== "wind" ? def.kind : n > 0 ? "headwind" : "tailwind";
    return [{ kind, text: def.text(input), effect: measure.format(n) }];
  });
  return [
    ...named,
    ...nightFactor(input, plan, inDark),
    ...distanceFactor(input, plan, inDark),
  ];
}
