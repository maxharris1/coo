import { describe, expect, it } from "vitest";
import type { SyncPayload } from "@/components/sync";
import { config } from "@/lib/config";
import { computeFlightPlan, type FlightInput } from "@/lib/flight/engine";
import { toBirdView } from "@/server/services/sync";
import { toFlight, type FlightRow } from "@/server/services/flights/shape";
import type { BirdRecord } from "@/server/rows";
import { moodLine, poseFor, tripOf } from "@/app/(app)/birds/[id]/pigeon";

const now = Date.parse("2026-11-20T19:00:00Z");
const record: BirdRecord = {
  id: "g", ownerId: "u", name: "Gerald", breed: "city", look: "gerald", pronoun: "he",
  speedMph: 45, focus: 3, navigation: 4, quirks: [], miles: 100, deliveries: 2,
  detours: 0, belly: 80, feathers: 80, energy: 100, careAt: now, lastFedAt: now,
  hungryNotified: false, status: "flying", busyKind: null, busyUntil: null,
  gear: ["goggles"], hatchedAt: now,
};
const bird = toBirdView(record, now, { hasBirdbath: false });
const from = { lat: 40.7, lon: -74 };
const to = { lat: 34.05, lon: -118.24 };
const input: FlightInput = {
  flightId: "roost-repro", from, to, departAtMs: now,
  bird: { speedMph: 45, focus: 3, navigation: 4, breed: "city", level: 3,
    belly: 80, feathers: 80, energy: 100, sulking: false },
  gear: [], weather: [config.game.weather.fallback, config.game.weather.fallback, config.game.weather.fallback],
};
const row = (kind: "delivery" | "return", status: FlightRow["status"] = "flying"): FlightRow => {
  const route = kind === "return" ? { from: to, to: from } : { from, to };
  const plan = computeFlightPlan({ ...input, ...route });
  return {
    id: kind, kind, status, owner_id: "u", counterpart_id: "friend",
    from_lat: route.from.lat, from_lon: route.from.lon, from_label: "From",
    to_lat: route.to.lat, to_lon: route.to.lon, to_label: "To",
    release_at: new Date(now), arrive_at: new Date(plan.arriveAtMs),
    distance_mi: plan.distanceMi, odds: plan.onTimeOdds, plan, input,
    place_names: {}, search_party: null, has_note: kind === "delivery",
    bird_id: "g", bird_name: "Gerald", bird_look: "gerald", bird_gear: [],
    owner_name: "Me", owner_handle: "me", counterpart_name: "Maya",
    counterpart_handle: "maya", guest_name: null,
  };
};
const snapshot = (flights: SyncPayload["flights"], serverNow: number) => ({ flights, serverNow });

describe("adversarial trip selection", () => {
  it("does not show a flying portrait during a stationary major delay", () => {
    const calm = { windMph: 0, windFromDeg: 0, tempF: 55, precipMmH: 0, snow: false };
    const delayedInput: FlightInput = {
      ...input,
      flightId: "vector-major-15",
      from: { lat: 40.7306, lon: -73.9866 },
      to: { lat: 39.9526, lon: -75.1652 },
      departAtMs: 1795100400000,
      bird: { ...input.bird, focus: 2, level: 1, energy: 80 },
      weather: [calm, calm, calm],
    };
    const plan = computeFlightPlan(delayedInput);
    const delay = plan.segments.find((s) => s.kind === "delay")!;
    const stored = row("delivery");
    stored.plan = plan;
    stored.from_lat = delayedInput.from.lat;
    stored.from_lon = delayedInput.from.lon;
    stored.to_lat = delayedInput.to.lat;
    stored.to_lon = delayedInput.to.lon;
    const flight = toFlight(stored, "u");
    const trip = tripOf(bird, snapshot([flight], delay.startMs + 1));
    const actual = { delayKind: plan.delayKind, engineState: trip, stationary: delay.fromFrac === delay.toFrac, durationMinutes: (delay.endMs - delay.startMs) / 60000, pose: poseFor(bird, trip), mood: moodLine(bird, trip) };
    console.log(JSON.stringify(actual));
    expect(actual.engineState).toBe("delayed");
    expect(actual.pose).not.toBe("fly");
  });
});
