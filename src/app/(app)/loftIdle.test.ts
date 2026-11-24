import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { perchedHeight } from "@/components/Bird";
import {
  GESTURES,
  GESTURE_NAMES,
  REST_MS,
  gestureAnimation,
  startLoftIdle,
  type Gesture,
} from "./loftIdle";
import { BIRD_SIZE } from "./LoftScene";

type FakeDoc = EventTarget & { hidden: boolean };
const fakeDoc = (hidden = false): FakeDoc =>
  Object.assign(new EventTarget(), { hidden });

const setHidden = (doc: FakeDoc, hidden: boolean) => {
  doc.hidden = hidden;
  doc.dispatchEvent(new Event("visibilitychange"));
};

const seeded = (seed = 1) => {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    return s / 2 ** 31;
  };
};

type Event_ = { at: number; id: string; gesture: Gesture | null };

function run(ids: string[], doc = fakeDoc(), random = seeded()) {
  const log: Event_[] = [];
  const pauses: boolean[] = [];
  const stop = startLoftIdle({
    birdIds: ids,
    reducedMotion: false,
    doc,
    random,
    onGesture: (id, gesture) => log.push({ at: Date.now(), id, gesture }),
    onPause: (p) => pauses.push(p),
  });
  return { log, pauses, stop, doc };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => vi.useRealTimers());

describe("loft idles (ac-7)", () => {
  it("offers the six one-shot gestures", () => {
    expect(GESTURE_NAMES).toEqual([
      "hop",
      "preen",
      "ruffle",
      "look",
      "stretch",
      "coo",
    ]);
    expect(gestureAnimation("hop")).toMatch(/^coo-loft-hop 900ms .* 1 both$/);
  });

  it("plays every gesture over time, each bird on its own timer, with rests of 4 to 12 s", () => {
    const { log, stop } = run(["gerald", "brenda", "benjamin"]);
    vi.advanceTimersByTime(10 * 60_000);
    stop();

    for (const id of ["gerald", "brenda", "benjamin"]) {
      const mine = log.filter((e) => e.id === id);
      const starts = mine.filter((e) => e.gesture !== null);
      expect(new Set(starts.map((e) => e.gesture))).toEqual(
        new Set(GESTURE_NAMES),
      );
      for (let i = 0; i + 1 < mine.length; i++) {
        const [a, b] = [mine[i], mine[i + 1]];
        if (a.gesture) {
          expect(b.gesture).toBeNull();
          expect(b.at - a.at).toBe(GESTURES[a.gesture].ms);
        } else {
          expect(b.at - a.at).toBeGreaterThanOrEqual(REST_MS.min);
          expect(b.at - a.at).toBeLessThanOrEqual(REST_MS.max);
        }
      }
    }
    const firstStart = (id: string) =>
      log.find((e) => e.id === id && e.gesture)?.at;
    expect(new Set(["gerald", "brenda", "benjamin"].map(firstStart)).size).toBe(
      3,
    );
  });

  it("stops its timers and pauses while the tab is hidden, and resumes when visible", () => {
    const { log, pauses, doc, stop } = run(["gerald", "brenda"]);
    expect(vi.getTimerCount()).toBe(2);

    setHidden(doc, true);
    expect(pauses).toEqual([false, true]);
    expect(vi.getTimerCount()).toBe(0);
    const before = log.length;
    vi.advanceTimersByTime(60_000);
    expect(log.length).toBe(before);

    setHidden(doc, false);
    expect(pauses).toEqual([false, true, false]);
    expect(vi.getTimerCount()).toBe(2);
    vi.advanceTimersByTime(REST_MS.max + REST_MS.min);
    expect(log.length).toBeGreaterThan(before);
    stop();
  });

  it("clears a gesture in progress when the tab hides", () => {
    const { log, doc, stop } = run(["gerald"]);
    vi.advanceTimersToNextTimer();
    expect(log.at(-1)?.gesture).not.toBeNull();
    setHidden(doc, true);
    expect(log.at(-1)).toMatchObject({ id: "gerald", gesture: null });
    stop();
  });

  it("starts paused with no timers when the tab is already hidden", () => {
    const { pauses, stop } = run(["gerald"], fakeDoc(true));
    expect(pauses).toEqual([true]);
    expect(vi.getTimerCount()).toBe(0);
    stop();
  });

  it("pauses an empty, all-away or all-tired loft while the tab is hidden", () => {
    const { pauses, doc, stop } = run([]);
    setHidden(doc, true);
    expect(pauses.at(-1)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);

    setHidden(doc, false);
    expect(pauses.at(-1)).toBe(false);
    stop();

    const seen = pauses.length;
    setHidden(doc, true);
    expect(pauses.length).toBe(seen);
  });

  it("clears a stale pause after hide, reduced motion on, show, reduced motion off", () => {
    const doc = fakeDoc();
    const log: Event_[] = [];
    let paused = false;
    const session = (reducedMotion: boolean) =>
      startLoftIdle({
        birdIds: ["gerald"],
        reducedMotion,
        doc,
        random: seeded(),
        onGesture: (id, gesture) => log.push({ at: Date.now(), id, gesture }),
        onPause: (p) => {
          paused = p;
        },
      });

    let stop = session(false);
    setHidden(doc, true);
    expect(paused).toBe(true);
    stop();

    stop = session(true);
    setHidden(doc, false);
    stop();

    stop = session(false);
    expect(paused).toBe(false);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    vi.advanceTimersByTime(REST_MS.max + REST_MS.min);
    expect(log.some((e) => e.gesture !== null)).toBe(true);
    stop();
  });

  it("stops every timer and listener when stopped", () => {
    const { log, doc, stop } = run(["gerald", "brenda"]);
    stop();
    expect(vi.getTimerCount()).toBe(0);
    setHidden(doc, false);
    vi.advanceTimersByTime(60_000);
    expect(log).toEqual([]);
  });
});

describe("loft idles under reduced motion (ac-6)", () => {
  it("starts no timers, no listener and no gestures", () => {
    const doc = fakeDoc();
    const listen = vi.spyOn(doc, "addEventListener");
    const onGesture = vi.fn();
    const onPause = vi.fn();
    const stop = startLoftIdle({
      birdIds: ["gerald", "brenda"],
      reducedMotion: true,
      doc,
      onGesture,
      onPause,
    });
    vi.advanceTimersByTime(60_000);
    expect(vi.getTimerCount()).toBe(0);
    expect(listen).not.toHaveBeenCalled();
    expect(onGesture).not.toHaveBeenCalled();
    stop();
  });
});

describe("idle keyframes stay inside the slot (ac-1, ac-7)", () => {
  const css = readFileSync(
    new URL("../../../public/assets/motion.css", import.meta.url),
    "utf8",
  );
  const birdH = perchedHeight(BIRD_SIZE);

  const transforms = (name: string) => {
    const block = css.match(
      new RegExp(`@keyframes ${name}\\{(.*?\\})\\}`),
    )?.[1];
    expect(block, name).toBeDefined();
    return [...(block ?? "").matchAll(/transform:([^;}]*)/g)].map((m) => m[1]);
  };

  for (const gesture of GESTURE_NAMES) {
    it(`${gesture} never travels sideways, grows wider or leaves its declared reach`, () => {
      const { keyframes, reach } = GESTURES[gesture];
      for (const t of transforms(keyframes)) {
        expect(t).not.toMatch(/translateX|rotate|translate\(/);
        const ty = Number(t.match(/translateY\((-?[\d.]+)px\)/)?.[1] ?? 0);
        const [sx, sy] = (t.match(/scale\(([^)]*)\)/)?.[1] ?? "1,1")
          .split(",")
          .map(Number);
        expect(Math.abs(sx)).toBeLessThanOrEqual(1);
        const lift = -ty + (sy - 1) * birdH;
        expect(lift, t).toBeLessThanOrEqual(reach.lift);
        expect(ty, t).toBeLessThanOrEqual(reach.sink);
      }
    });
  }

  it("keeps the global reduced-motion rule", () => {
    expect(css).toContain(
      "@media (prefers-reduced-motion: reduce){*{animation:none !important}}",
    );
  });
});
