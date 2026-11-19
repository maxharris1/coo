// Checks flightEngine.ts against vectors.json. Run: node --test flightEngine.test.ts
// When you port the engine into the app, port this file too (swap node:test for the project's test runner).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as E from './flightEngine.ts';

const data = JSON.parse(readFileSync(new URL('./vectors.json', import.meta.url), 'utf8'));
const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`);

for (const v of data.vectors) {
  test(`plan: ${v.name}`, () => {
    const plan = E.computeFlightPlan(v.input);
    near(plan.distanceMi, v.plan.distanceMi);
    near(plan.bearingDeg, v.plan.bearingDeg);
    assert.equal(plan.onTimeOdds, v.plan.onTimeOdds);
    assert.equal(plan.delayed, v.plan.delayed);
    assert.equal(plan.delayKind, v.plan.delayKind);
    assert.equal(plan.arriveAtMs, v.plan.arriveAtMs);
    assert.equal(plan.segments.length, v.plan.segments.length);
    plan.segments.forEach((s, i) => {
      const x = v.plan.segments[i];
      assert.equal(s.kind, x.kind); assert.equal(s.startMs, x.startMs); assert.equal(s.endMs, x.endMs);
      near(s.fromFrac, x.fromFrac, 1e-9); near(s.toFrac, x.toFrac, 1e-9);
    });
    assert.deepEqual(plan.events, v.plan.events);
    for (const s of v.samples) {
      const p = E.positionAt(plan, v.input.from, v.input.to, s.atMs);
      assert.equal(p.state, s.state); near(p.frac, s.frac, 1e-9); near(p.lat, s.lat); near(p.lon, s.lon);
    }
  });
}

test('plans are well formed', () => {
  for (const v of data.vectors) {
    const plan = E.computeFlightPlan(v.input);
    let t = v.input.departAtMs, frac = 0;
    for (const s of plan.segments) {
      assert.equal(s.startMs, t, `${v.name}: segments must be contiguous`);
      assert.ok(s.endMs >= s.startMs); near(s.fromFrac, frac, 1e-12); assert.ok(s.toFrac >= s.fromFrac);
      if (s.kind !== 'fly') assert.equal(s.toFrac, s.fromFrac, `${v.name}: only flying moves the bird`);
      t = s.endMs; frac = s.toFrac;
    }
    assert.equal(t, plan.arriveAtMs); near(frac, 1, 1e-12);
    assert.ok(plan.onTimeOdds >= E.CONFIG.oddsMin && plan.onTimeOdds <= E.CONFIG.oddsMax);
  }
});

test('same input, same plan', () => {
  const v = data.vectors[0];
  assert.deepEqual(E.computeFlightPlan(v.input), E.computeFlightPlan(structuredClone(v.input)));
});

test('birds do not fly in the dark', () => {
  for (const v of data.vectors) {
    const plan = E.computeFlightPlan(v.input);
    const limit = v.input.bird.breed === 'king' ? E.CONFIG.kingSunAltitudeDeg : E.CONFIG.sunAltitudeDeg;
    for (const s of plan.segments) {
      if (s.kind !== 'fly' || s.endMs - s.startMs < 3 * 60_000) continue;
      const mid = (s.startMs + s.endMs) / 2, p = E.positionAt(plan, v.input.from, v.input.to, mid);
      assert.ok(E.sunAltitudeDeg(mid, p) > limit, `${v.name}: flying at night`);
    }
  }
});

test('sun times', () => { for (const s of data.sun) { const r = E.sunTimes(s.atMs, s.place); assert.equal(r.sunriseMs, s.sunriseMs); assert.equal(r.sunsetMs, s.sunsetMs); } });
test('search party', () => { for (const s of data.searchParty) assert.equal(E.searchParty(s.flightId, s.nowMs), s.result); });
test('hazards', () => { for (const h of data.hazards) assert.deepEqual(E.hazardsFor(h.atMs, h.from, h.to, h.localWeekend), h.result); });

test('roughly the promised share of flights are delayed', () => {
  const v = data.vectors.find((x: any) => x.name === 'lucky-band');
  let delayed = 0; const n = 4000;
  for (let i = 0; i < n; i++) if (E.computeFlightPlan({ ...v.input, flightId: 'stat-' + i }).delayed) delayed++;
  near(delayed / n, 1 - 0.94, 0.015);
});
