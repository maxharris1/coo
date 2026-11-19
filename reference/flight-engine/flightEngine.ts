/**
 * Coo flight engine: reference implementation.
 *
 * Pure and deterministic. No I/O, no Date.now(), no Math.random(). The same input always
 * returns the same plan, on the server and in the browser. The server computes a plan once
 * when a bird is released and stores it; clients only read the plan and call positionAt().
 *
 * Port this file as-is into src/lib/flight/engine.ts. vectors.json holds expected outputs.
 */

export type LatLon = { lat: number; lon: number };

/** Weather for one third of the route, sampled once at release (see docs/04-game-rules.md). */
export type WeatherSample = {
  windMph: number;      // wind speed at 10 m
  windFromDeg: number;  // direction the wind blows FROM, degrees clockwise from north
  tempF: number;
  precipMmH: number;    // rain rate, mm per hour
  snow: boolean;
};

export type BirdState = {
  speedMph: number;     // base airspeed in calm air
  focus: number;        // 1 to 5
  navigation: number;   // 1 to 5. Better navigators get back on course sooner after a delay.
  breed?: string;       // 'city' (default), 'fantail', 'pouter', 'frillback', 'jacobin', 'king', 'tumbler'
  level: number;        // 1 and up
  belly: number;        // 0 to 100
  feathers: number;     // 0 to 100
  energy: number;       // 0 to 100
  sulking: boolean;
};

export type FlightInput = {
  flightId: string;     // UUID. The only source of randomness.
  from: LatLon;
  to: LatLon;
  departAtMs: number;   // epoch milliseconds, UTC
  bird: BirdState;
  gear: string[];       // gear ids the bird is wearing
  weather: [WeatherSample, WeatherSample, WeatherSample];
  hazards?: { hawk?: boolean; fair?: boolean };
  /** Set by a successful search party: ends a delay early (epoch ms). */
  delayEndOverrideMs?: number;
};

export type SegmentKind = 'fly' | 'roost' | 'delay';
export type Segment = { kind: SegmentKind; startMs: number; endMs: number; fromFrac: number; toFrac: number };
export type EventKind = 'takeoff' | 'nightwait' | 'cruising' | 'food' | 'landmark' | 'weather' | 'dusk' | 'sunrise' | 'delay' | 'landing';
export type FlightEvent = { atMs: number; kind: EventKind; pick: number };

export type FlightPlan = {
  distanceMi: number;
  bearingDeg: number;
  onTimeOdds: number;   // 0.40 to 0.99, shown to the sender as "arrival odds"
  delayed: boolean;
  delayKind: 'none' | 'minor' | 'major';
  arriveAtMs: number;
  segments: Segment[];
  events: FlightEvent[];
};

export const CONFIG = {
  stepMs: 60_000,
  sunAltitudeDeg: -0.833,       // sun counts as up above this
  kingSunAltitudeDeg: -6,       // King pigeons fly through civil twilight
  capHeadwindFactor: 0.3,       // captain's cap: headwinds bite less
  navDelayBase: 1.3, navDelayPerPoint: 0.1, // delay length is multiplied by base - perPoint * navigation
  hawkChance: 0.15, fairChance: 0.25, hazardCellDeg: 0.5,
  searchSuccessChance: 0.7, searchMinutes: [10, 60] as const,
  headwindFactor: 0.45,         // share of the headwind taken off ground speed (tailwind adds the same share)
  minGroundMph: 8,
  levelSpeedBonus: 0.01,        // per level above 1
  sulkSpeed: 0.9,
  rainMmH: 0.5, downpourMmH: 4,
  rainSpeed: 0.85, downpourSpeed: 0.7, coldF: 32, coldSpeed: 0.8, snowSpeed: 0.7,
  oddsBase: 0.85, oddsPerFocus: 0.03,
  oddsHungry: 0.06, oddsDirty: 0.03, oddsTired: 0.10, oddsRain: 0.06, oddsHawk: 0.04, oddsHawkBandana: 0.02, oddsFair: 0.03, oddsBand: 0.03,
  oddsPer100Mi: 0.01, oddsDistanceCap: 0.10, oddsMin: 0.40, oddsMax: 0.99,
  hungryBelow: 30, dirtyBelow: 30, tiredBelow: 40,
  majorDelayShare: 0.2,
  minorDelayMin: [4, 25] as const,
  majorDelayMin: [60, 300] as const,
  delayFracRange: [0.15, 0.85] as const,
  maxFlavorEvents: 6,
  maxSimDays: 30,
};

const RAD = Math.PI / 180;
const EARTH_MI = 3958.7613;

// ---------------------------------------------------------------- geometry
export function haversineMi(a: LatLon, b: LatLon): number {
  const dLat = (b.lat - a.lat) * RAD, dLon = (b.lon - a.lon) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_MI * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial great-circle bearing from a to b, degrees clockwise from north, 0 to 360. */
export function bearingDeg(a: LatLon, b: LatLon): number {
  const p1 = a.lat * RAD, p2 = b.lat * RAD, dl = (b.lon - a.lon) * RAD;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (Math.atan2(y, x) / RAD + 360) % 360;
}

/** Point a fraction f (0 to 1) of the way along the great circle from a to b. */
export function interpolate(a: LatLon, b: LatLon, f: number): LatLon {
  const d = haversineMi(a, b) / EARTH_MI;
  if (d < 1e-9) return { lat: a.lat, lon: a.lon };
  const A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
  const p1 = a.lat * RAD, l1 = a.lon * RAD, p2 = b.lat * RAD, l2 = b.lon * RAD;
  const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2);
  const y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2);
  const z = A * Math.sin(p1) + B * Math.sin(p2);
  return { lat: Math.atan2(z, Math.sqrt(x * x + y * y)) / RAD, lon: Math.atan2(y, x) / RAD };
}

// ---------------------------------------------------------------- sun
const DAY_MS = 86_400_000, J1970 = 2440588, J2000 = 2451545, OBLIQUITY = RAD * 23.4397;
const toDays = (ms: number) => ms / DAY_MS - 0.5 + J1970 - J2000;
const meanAnomaly = (d: number) => RAD * (357.5291 + 0.98560028 * d);
function eclipticLongitude(M: number): number {
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  return M + C + RAD * 102.9372 + Math.PI;
}

/** Sun altitude above the horizon in degrees, at a moment and place. */
export function sunAltitudeDeg(ms: number, p: LatLon): number {
  const d = toDays(ms), lw = -p.lon * RAD, phi = p.lat * RAD;
  const L = eclipticLongitude(meanAnomaly(d));
  const dec = Math.asin(Math.sin(L) * Math.sin(OBLIQUITY));
  const ra = Math.atan2(Math.sin(L) * Math.cos(OBLIQUITY), Math.cos(L));
  const H = RAD * (280.16 + 360.9856235 * d) - lw - ra;
  return Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H)) / RAD;
}

export const isDaylight = (ms: number, p: LatLon, thresholdDeg: number = CONFIG.sunAltitudeDeg) => sunAltitudeDeg(ms, p) > thresholdDeg;

/** Sunrise and sunset (epoch ms) for the solar day nearest to `ms` at a place. For display only. */
export function sunTimes(ms: number, p: LatLon): { sunriseMs: number; sunsetMs: number } {
  const lw = -p.lon * RAD, phi = p.lat * RAD, d = toDays(ms), J0 = 0.0009;
  const n = Math.round(d - J0 - lw / (2 * Math.PI));
  const transit = (Ht: number) => J0 + (Ht + lw) / (2 * Math.PI) + n;
  const ds = transit(0), M = meanAnomaly(ds), L = eclipticLongitude(M);
  const dec = Math.asin(Math.sin(L) * Math.sin(OBLIQUITY));
  const toJ = (x: number) => J2000 + x + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  const noon = toJ(ds);
  const w = Math.acos((Math.sin(CONFIG.sunAltitudeDeg * RAD) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec)));
  const set = toJ(transit(w));
  const fromJ = (j: number) => (j + 0.5 - J1970) * DAY_MS;
  return { sunriseMs: Math.round(fromJ(noon - (set - noon))), sunsetMs: Math.round(fromJ(set)) };
}

// ---------------------------------------------------------------- randomness
/** FNV-1a 32-bit hash of a string. */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** mulberry32: returns a function giving floats in [0, 1). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- rules
const has = (gear: string[], id: string) => gear.includes(id);
const isRain = (w: WeatherSample) => w.precipMmH >= CONFIG.rainMmH;
const isDownpour = (w: WeatherSample) => w.precipMmH >= CONFIG.downpourMmH;

/** Ground speed in mph for one third of the route (index 0, 1 or 2). */
export function groundSpeedMph(input: FlightInput, third: number, routeBearing: number): number {
  const c = CONFIG, w = input.weather[third], g = input.gear, b = input.bird;
  let air = b.speedMph * (1 + c.levelSpeedBonus * (b.level - 1)) * (b.sulking ? c.sulkSpeed : 1);
  if (isDownpour(w)) air *= has(g, 'rainhat') ? 1 : c.downpourSpeed;
  else if (isRain(w)) air *= has(g, 'goggles') || has(g, 'rainhat') || b.breed === 'frillback' ? 1 : c.rainSpeed;
  if (w.tempF < c.coldF) air *= has(g, 'beanie') || has(g, 'scarf') ? 1 : c.coldSpeed;
  if (w.snow) air *= has(g, 'scarf') ? 1 : c.snowSpeed;
  const headwind = w.windMph * Math.cos((w.windFromDeg - routeBearing) * RAD);
  const factor = headwind > 0 && has(g, 'cap') ? c.capHeadwindFactor : c.headwindFactor;
  return Math.max(c.minGroundMph, air - factor * headwind);
}

/** Chance the bird arrives without a delay. This is the "arrival odds" number in the interface. */
export function onTimeOdds(input: FlightInput, distanceMi: number): number {
  const c = CONFIG, b = input.bird, g = input.gear;
  let p = c.oddsBase + c.oddsPerFocus * b.focus;
  if (b.belly < c.hungryBelow) p -= c.oddsHungry;
  if (b.feathers < c.dirtyBelow) p -= c.oddsDirty;
  if (b.energy < c.tiredBelow) p -= c.oddsTired;
  const drizzleProof = b.breed === 'frillback' && !input.weather.some(isDownpour);
  if (input.weather.some(isRain) && !has(g, 'rainhat') && !drizzleProof) p -= c.oddsRain;
  if (input.hazards?.hawk) p -= has(g, 'bandana') ? c.oddsHawkBandana : c.oddsHawk;
  if (input.hazards?.fair && !has(g, 'earmuffs') && b.breed !== 'jacobin') p -= c.oddsFair;
  if (has(g, 'band')) p += c.oddsBand;
  p -= Math.min(c.oddsDistanceCap, c.oddsPer100Mi * Math.floor(Math.max(0, distanceMi - 100) / 100));
  return Math.round(Math.min(c.oddsMax, Math.max(c.oddsMin, p)) * 100) / 100;
}

// ---------------------------------------------------------------- the plan
export function computeFlightPlan(input: FlightInput): FlightPlan {
  const c = CONFIG;
  const distanceMi = haversineMi(input.from, input.to);
  const bearing = bearingDeg(input.from, input.to);
  const odds = onTimeOdds(input, distanceMi);
  const rand = rng(hash32(input.flightId));

  // Draw order is fixed. Always draw all five numbers, used or not.
  const rOnTime = rand(), rMajor = rand(), rFrac = rand(), rLen = rand(), rFlavor = rand();
  const delayed = rOnTime >= odds;
  const delayKind: FlightPlan['delayKind'] = !delayed ? 'none' : rMajor < c.majorDelayShare ? 'major' : 'minor';
  const range = delayKind === 'major' ? c.majorDelayMin : c.minorDelayMin;
  const navFactor = c.navDelayBase - c.navDelayPerPoint * input.bird.navigation;
  const delayMs = delayed ? Math.round((range[0] + Math.floor(rLen * (range[1] - range[0] + 1))) * navFactor) * 60_000 : 0;
  const sunDeg = input.bird.breed === 'king' ? c.kingSunAltitudeDeg : c.sunAltitudeDeg;
  const delayAtFrac = c.delayFracRange[0] + rFrac * (c.delayFracRange[1] - c.delayFracRange[0]);

  const speeds = [0, 1, 2].map((i) => groundSpeedMph(input, i, bearing));
  const segments: Segment[] = [];
  const events: FlightEvent[] = [{ atMs: input.departAtMs, kind: 'takeoff', pick: Math.floor(rFlavor * 1000) }];
  const push = (kind: SegmentKind, startMs: number, endMs: number, fromFrac: number, toFrac: number) => {
    const last = segments[segments.length - 1];
    if (last && last.kind === kind && last.endMs === startMs) { last.endMs = endMs; last.toFrac = toFrac; }
    else segments.push({ kind, startMs, endMs, fromFrac, toFrac });
  };

  let t = input.departAtMs, frac = 0, delayDone = !delayed;
  const limit = input.departAtMs + c.maxSimDays * DAY_MS;
  if (distanceMi < 1e-6) frac = 1;
  while (frac < 1 && t < limit) {
    if (!delayDone && frac >= delayAtFrac) {
      const end = input.delayEndOverrideMs !== undefined ? Math.max(t, Math.min(t + delayMs, input.delayEndOverrideMs)) : t + delayMs;
      push('delay', t, end, frac, frac);
      events.push({ atMs: t, kind: 'delay', pick: Math.floor(rLen * 1000) });
      t = end; delayDone = true;
      continue;
    }
    const here = interpolate(input.from, input.to, frac);
    if (!isDaylight(t, here, sunDeg)) {
      const last = segments[segments.length - 1];
      if (!last || last.kind !== 'roost') events.push({ atMs: t, kind: frac === 0 ? 'nightwait' : 'dusk', pick: Math.floor(frac * 1000) });
      push('roost', t, t + c.stepMs, frac, frac);
      t += c.stepMs;
      if (isDaylight(t, here, sunDeg)) events.push({ atMs: t, kind: 'sunrise', pick: Math.floor(frac * 1000) });
      continue;
    }
    const mph = speeds[Math.min(2, Math.floor(frac * 3))];
    const stepFrac = (mph * (c.stepMs / 3_600_000)) / distanceMi;
    let nextFrac = frac + stepFrac, dt = c.stepMs;
    const cap = !delayDone && frac < delayAtFrac ? Math.min(1, delayAtFrac) : 1;
    if (nextFrac >= cap) { dt = Math.ceil((c.stepMs * (cap - frac)) / stepFrac); nextFrac = cap; }
    push('fly', t, t + dt, frac, nextFrac);
    t += dt; frac = nextFrac;
  }
  const arriveAtMs = t;

  // Flavour events: one per started flying hour plus one, capped, spread over the flying segments.
  const flyMs = segments.filter((s) => s.kind === 'fly').reduce((a, s) => a + (s.endMs - s.startMs), 0);
  const count = Math.min(c.maxFlavorEvents, Math.floor(flyMs / 3_600_000) + 1);
  const kinds: EventKind[] = ['cruising', 'food', 'landmark'];
  for (let i = 0; i < count; i++) {
    const at = ((i + 0.5 + (rand() - 0.5) * 0.6) / count) * flyMs;
    const kind = kinds[Math.floor(rand() * kinds.length)];
    let acc = 0;
    for (const s of segments) {
      if (s.kind !== 'fly') continue;
      const len = s.endMs - s.startMs;
      if (at <= acc + len) { events.push({ atMs: Math.round(s.startMs + (at - acc)), kind, pick: Math.floor(rand() * 1000) }); break; }
      acc += len;
    }
  }
  if (input.weather.some((w) => isRain(w) || w.snow || w.tempF < c.coldF || w.windMph >= 12)) {
    const first = segments.find((s) => s.kind === 'fly');
    if (first) events.push({ atMs: Math.round(first.startMs + (first.endMs - first.startMs) / 2), kind: 'weather', pick: Math.floor(rand() * 1000) });
  }
  events.push({ atMs: arriveAtMs, kind: 'landing', pick: Math.floor(rand() * 1000) });
  events.sort((a, b) => a.atMs - b.atMs);

  return { distanceMi, bearingDeg: bearing, onTimeOdds: odds, delayed, delayKind, arriveAtMs, segments, events };
}

export type BirdPosition = { lat: number; lon: number; frac: number; state: 'waiting' | 'flying' | 'roosting' | 'delayed' | 'landed' };

/** Where the bird is at a moment. Clients call this every animation frame with the stored plan. */
export function positionAt(plan: FlightPlan, from: LatLon, to: LatLon, ms: number): BirdPosition {
  const state = (k: SegmentKind) => (k === 'fly' ? 'flying' : k === 'roost' ? 'roosting' : 'delayed') as BirdPosition['state'];
  if (!plan.segments.length || ms >= plan.arriveAtMs) return { ...to, frac: 1, state: 'landed' };
  if (ms < plan.segments[0].startMs) return { ...from, frac: 0, state: 'waiting' };
  for (const s of plan.segments) {
    if (ms < s.endMs) {
      const k = s.endMs === s.startMs ? 1 : (ms - s.startMs) / (s.endMs - s.startMs);
      const frac = s.fromFrac + (s.toFrac - s.fromFrac) * k;
      return { ...interpolate(from, to, frac), frac, state: state(s.kind) };
    }
  }
  return { ...to, frac: 1, state: 'landed' };
}

/**
 * Search party on a major delay. Returns the override to store, or null if the party found nothing.
 * Seeded separately so the result cannot be re-rolled.
 */
export function searchParty(flightId: string, nowMs: number): number | null {
  const r = rng(hash32(flightId + ':search'));
  if (r() >= CONFIG.searchSuccessChance) return null;
  const [lo, hi] = CONFIG.searchMinutes;
  return nowMs + (lo + Math.floor(r() * (hi - lo + 1))) * 60_000;
}

/**
 * Hazards along a route on the day of departure. Deterministic: the same day and the same
 * half-degree cell around the route midpoint always give the same answer, so the forecast
 * screen and the release agree, and so do two friends looking at the same route.
 * `localWeekend` is true when the departure falls on a Saturday or Sunday in the sender's time zone.
 */
export function hazardsFor(departAtMs: number, from: LatLon, to: LatLon, localWeekend: boolean): { hawk: boolean; fair: boolean } {
  const mid = interpolate(from, to, 0.5), cell = CONFIG.hazardCellDeg;
  const key = `${Math.floor(departAtMs / DAY_MS)}:${Math.floor(mid.lat / cell)}:${Math.floor(mid.lon / cell)}`;
  const r = rng(hash32('hazard:' + key));
  const hawk = r() < CONFIG.hawkChance, fairRoll = r();
  return { hawk, fair: localWeekend && fairRoll < CONFIG.fairChance };
}
