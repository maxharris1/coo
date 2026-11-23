// Regenerates vectors.json from flightEngine.ts. Run: node gen-vectors.mjs   (Node 22.18 or later runs .ts files directly)
import { writeFileSync } from 'node:fs';
import * as E from './flightEngine.ts';

const P = {
  eastVillage: { lat: 40.7306, lon: -73.9866 }, williamsburg: { lat: 40.7081, lon: -73.9571 },
  philadelphia: { lat: 39.9526, lon: -75.1652 }, boston: { lat: 42.3601, lon: -71.0589 },
  chicago: { lat: 41.8781, lon: -87.6298 }, losAngeles: { lat: 34.0522, lon: -118.2437 },
};
const calm = { windMph: 0, windFromDeg: 0, tempF: 55, precipMmH: 0, snow: false };
const w = (o) => { const x = { ...calm, ...o }; return [x, x, x]; };
const gerald = { speedMph: 45, focus: 2, navigation: 4, level: 1, belly: 80, feathers: 80, energy: 80, sulking: false, breed: 'city' };
const t10am = Date.UTC(2026, 10, 19, 15, 0, 0);   // Thu 19 Nov 2026, 10:00 am in New York
const base = { from: P.eastVillage, to: P.philadelphia, departAtMs: t10am, bird: gerald, gear: [], weather: w({}) };

// Find flight ids that roll a minor and a major delay for the base route, so both branches are covered.
const find = (kind) => { for (let i = 0; ; i++) { const id = `vector-${kind}-${i}`; if (E.computeFlightPlan({ ...base, flightId: id }).delayKind === kind) return id; } };
const minorId = find('minor'), majorId = find('major');
const majorPlan = E.computeFlightPlan({ ...base, flightId: majorId });
const majorDelay = majorPlan.segments.find((s) => s.kind === 'delay');

const cases = [
  ['calm-short', 'New York to Philadelphia, calm, no gear', {}],
  ['lucky-band', 'Same flight wearing the lucky leg band: odds 0.94', { gear: ['band'] }],
  ['headwind', '14 mph wind from the southwest, straight on the beak', { weather: w({ windMph: 14, windFromDeg: 225 }) }],
  ['headwind-cap', 'Same headwind with the captain\'s cap', { weather: w({ windMph: 14, windFromDeg: 225 }), gear: ['cap'] }],
  ['tailwind', '14 mph wind from the northeast, pushing him along', { weather: w({ windMph: 14, windFromDeg: 45 }) }],
  ['rain-bare', 'Light rain, no gear: slower and lower odds', { weather: w({ precipMmH: 1 }) }],
  ['rain-goggles', 'Light rain with goggles: full speed, odds still lower', { weather: w({ precipMmH: 1 }), gear: ['goggles'] }],
  ['downpour-rainhat', 'Downpour with the rain hat: no effect at all', { weather: w({ precipMmH: 6 }), gear: ['rainhat'] }],
  ['downpour-bare', 'Downpour, no gear', { weather: w({ precipMmH: 6 }) }],
  ['snow-bare', 'Snow at 28F, no gear: cold and snow both apply', { weather: w({ tempF: 28, snow: true }) }],
  ['snow-scarf', 'Snow at 28F with the thermal scarf', { weather: w({ tempF: 28, snow: true }), gear: ['scarf'] }],
  ['mixed-thirds', 'Different weather in each third of the route', { weather: [{ ...calm }, { ...calm, precipMmH: 2 }, { ...calm, windMph: 20, windFromDeg: 230 }] }],
  ['hazards', 'Rain, hawk and street fair with the lucky band: odds 0.81', { weather: w({ precipMmH: 1 }), gear: ['band'], hazards: { hawk: true, fair: true } }],
  ['hazards-geared', 'Hawk and street fair wearing the bandana: the hawk penalty is halved', { gear: ['bandana'], hazards: { hawk: true, fair: true } }],
  ['hungry-tired-dirty', 'A neglected bird: belly 20, feathers 20, energy 30, sulking', { bird: { ...gerald, belly: 20, feathers: 20, energy: 30, sulking: true } }],
  ['level-6', 'Level 6 bird is 5 percent faster', { bird: { ...gerald, level: 6 } }],
  ['block', 'East Village to Williamsburg, about two miles', { to: P.williamsburg }],
  ['boston', 'New York to Boston', { to: P.boston }],
  ['chicago-overnight', 'New York to Chicago: one night in a barn', { to: P.chicago }],
  ['la-many-nights', 'New York to Los Angeles: several nights, distance penalty capped', { to: P.losAngeles }],
  ['night-release', 'Released at 10 pm: waits at the loft until sunrise', { departAtMs: Date.UTC(2026, 10, 20, 3, 0, 0) }],
  ['king-twilight', 'A King pigeon to Chicago flies a little later into dusk', { to: P.chicago, bird: { ...gerald, breed: 'king' } }],
  ['frillback-drizzle', 'A Frillback ignores light rain entirely', { weather: w({ precipMmH: 1 }), bird: { ...gerald, breed: 'frillback' } }],
  ['jacobin-fair', 'A Jacobin ignores the street fair', { hazards: { fair: true }, bird: { ...gerald, breed: 'jacobin', focus: 5, navigation: 2 } }],
  ['delay-minor', 'A flight id that rolls a minor delay', { flightId: minorId, bird: { ...gerald, focus: 1 } }],
  ['delay-major', 'A flight id that rolls a major delay', { flightId: majorId }],
  ['delay-major-poor-navigator', 'Same major delay, navigation 1: the delay is longer', { flightId: majorId, bird: { ...gerald, navigation: 1 } }],
  ['delay-major-search-party', 'Same major delay ended early by a search party', { flightId: majorId, delayEndOverrideMs: majorDelay.startMs + 20 * 60_000 }],
  ['night-release-nightgoggles', 'Released at 10 pm wearing night goggles: flies through the dark at once', { departAtMs: Date.UTC(2026, 10, 20, 3, 0, 0), gear: ['nightgoggles'] }],
  ['chicago-nightgoggles', 'New York to Chicago wearing night goggles: no barn, flies through the night', { to: P.chicago, gear: ['nightgoggles'] }],
  ['la-first-night', 'New York to Los Angeles, may fly in the dark until the first sunrise: flies through the first night only', { to: P.losAngeles, nightFlightUntilMs: E.sunTimes(t10am + 86_400_000, P.eastVillage).sunriseMs }],
];

const vectors = cases.map(([name, about, over], i) => {
  const input = { flightId: `vector-${String(i).padStart(2, '0')}-${name}`, ...base, ...over };
  const plan = E.computeFlightPlan(input);
  const span = plan.arriveAtMs - input.departAtMs;
  const samples = [0, 0.1, 0.33, 0.5, 0.75, 0.99, 1].map((k) => {
    const atMs = Math.round(input.departAtMs + span * k);
    return { atMs, ...E.positionAt(plan, input.from, input.to, atMs) };
  });
  return { name, about, input, plan, samples };
});

const out = {
  note: 'Expected outputs of reference/flight-engine/flightEngine.ts. Regenerate with: node gen-vectors.mjs',
  config: E.CONFIG,
  sun: [
    { about: 'New York, 19 Nov 2026', atMs: t10am, place: P.eastVillage, ...E.sunTimes(t10am, P.eastVillage) },
    { about: 'Chicago, 21 Jun 2026', atMs: Date.UTC(2026, 5, 21, 18), place: P.chicago, ...E.sunTimes(Date.UTC(2026, 5, 21, 18), P.chicago) },
  ],
  searchParty: ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ flightId: id, nowMs: t10am, result: E.searchParty(id, t10am) })),
  hazards: [0, 1, 2, 3, 4, 5, 6, 7].map((d) => { const atMs = t10am + d * 86_400_000; return { atMs, from: P.eastVillage, to: P.philadelphia, localWeekend: true, result: E.hazardsFor(atMs, P.eastVillage, P.philadelphia, true) }; }),
  vectors,
};
writeFileSync(new URL('./vectors.json', import.meta.url), JSON.stringify(out, null, 1));
for (const v of vectors) console.log(v.name.padEnd(30), (v.plan.distanceMi.toFixed(1) + ' mi').padStart(10), ((v.plan.arriveAtMs - v.input.departAtMs) / 60000).toFixed(1).padStart(8) + ' min', v.plan.onTimeOdds, v.plan.delayKind, v.plan.segments.map((s) => s.kind[0]).join(''));
