import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Bird } from "@/components/Bird";
import { toBirdView } from "@/server/services/sync";
import type { BirdRecord } from "@/server/rows";
import {
  computeFlightPlan,
  positionAt,
  type FlightInput,
} from "@/lib/flight/engine";
import { config } from "@/lib/config";
import PigeonPage from "@/app/(app)/birds/[id]/page";
import { moodLine } from "@/app/(app)/birds/[id]/pigeon";

const state = vi.hoisted(() => ({ data: null as unknown }));
vi.mock("@/components/SyncProvider", () => ({
  useSync: () => ({ data: state.data, refresh() {} }),
}));
vi.mock("@/components/Toasts", () => ({ useToast: () => () => {} }));
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "g" }) }));
const now = Date.parse("2026-11-20T19:00:00Z");
const record = (over: Partial<BirdRecord> = {}): BirdRecord => ({
  id: "g",
  ownerId: "u",
  name: "Gerald",
  breed: "city",
  look: "gerald",
  pronoun: "he",
  speedMph: 45,
  focus: 3,
  navigation: 4,
  quirks: [],
  miles: 100,
  deliveries: 2,
  detours: 0,
  belly: 80,
  feathers: 80,
  energy: 10,
  careAt: now,
  lastFedAt: now,
  hungryNotified: false,
  status: "home",
  busyKind: null,
  busyUntil: null,
  gear: ["goggles"],
  hatchedAt: now,
  ...over,
});

it("a bird blocked by low energy must not claim it can still fly", () => {
  const bird = {
    ...toBirdView(record(), now, { hasBirdbath: false }),
    jobId: null,
  };
  const actual = {
    energy: bird.energy,
    canFly: bird.canFly,
    cannotFlyReason: bird.cannotFlyReason,
    mood: moodLine(bird),
  };
  console.log(JSON.stringify(actual));
  expect(actual.canFly).toBe(false);
  expect(actual.mood).not.toContain("can still fly");
});

it("a roosting flight must show the documented sleeping portrait", () => {
  const from = { lat: 40.7, lon: -74 };
  const to = { lat: 34.05, lon: -118.24 };
  const input: FlightInput = {
    flightId: "roost-repro",
    from,
    to,
    departAtMs: now,
    bird: {
      speedMph: 45,
      focus: 3,
      navigation: 4,
      breed: "city",
      level: 3,
      belly: 80,
      feathers: 80,
      energy: 100,
      sulking: false,
    },
    gear: [],
    weather: [
      config.game.weather.fallback,
      config.game.weather.fallback,
      config.game.weather.fallback,
    ],
  };
  const plan = computeFlightPlan(input);
  const roost = plan.segments.find((s) => s.kind === "roost")!;
  expect(roost).toBeDefined();
  const during = (roost.startMs + roost.endMs) / 2;
  const bird = toBirdView(
    record({
      status: "flying",
      energy: 100,
      careAt: during,
      lastFedAt: during,
    }),
    during,
    { hasBirdbath: false },
  );
  state.data = {
    me: { timezone: "UTC" },
    serverNow: during,
    birds: [bird],
    myVisiting: [],
    flights: [
      {
        id: "roost-repro",
        kind: "delivery",
        status: "flying",
        role: "mine",
        bird: { id: "g", name: "Gerald" },
        owner: { id: "u", name: "Me" },
        counterpart: { id: "friend", name: "Maya" },
        to: { ...to, label: "Los Angeles" },
        from,
        releaseAt: now,
        arriveAt: plan.arriveAtMs,
        input,
        plan,
      },
    ],
  };
  const html = renderToStaticMarkup(<PigeonPage />);
  const sleep = renderToStaticMarkup(
    <Bird
      look="gerald"
      breed="city"
      gear={["goggles"]}
      pose="sleep"
      size={168}
      title="Gerald"
    />,
  );
  const fly = renderToStaticMarkup(
    <Bird
      look="gerald"
      breed="city"
      gear={["goggles"]}
      pose="fly"
      size={168}
      title="Gerald"
    />,
  );
  console.log(
    JSON.stringify({
      engineState: positionAt(plan, from, to, during).state,
      renderedFlyingPortrait: html.includes(fly),
      renderedSleepingPortrait: html.includes(sleep),
    }),
  );
  expect(html.includes(sleep), "roosting portrait must use sleep").toBe(true);
});
