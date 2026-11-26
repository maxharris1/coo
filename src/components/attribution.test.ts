import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ATTRIBUTION_OPEN_MS, collapseAttributionSoon } from "./attribution";

type Handler = (e: { originalEvent?: unknown }) => void;

class FakeMap {
  handlers: Record<string, Handler[]> = {};
  on(event: string, fn: Handler) {
    (this.handlers[event] ??= []).push(fn);
    return this;
  }
  off(event: string, fn: Handler) {
    this.handlers[event] = (this.handlers[event] ?? []).filter((f) => f !== fn);
    return this;
  }
  fire(event: string, e: { originalEvent?: unknown } = {}) {
    for (const fn of [...(this.handlers[event] ?? [])]) fn(e);
  }
  listeners() {
    return Object.values(this.handlers).flat().length;
  }
}

/** MapLibre's compact control as it stands once its text has arrived. */
class FakeControl {
  classes = new Set([
    "maplibregl-ctrl",
    "maplibregl-ctrl-attrib",
    "maplibregl-compact",
    "maplibregl-compact-show",
  ]);
  open = true;
  classList = {
    contains: (c: string) => this.classes.has(c),
    remove: (c: string) => this.classes.delete(c),
  };
  removeAttribute(name: string) {
    if (name === "open") this.open = false;
  }
  get shown() {
    return this.classes.has("maplibregl-compact-show") && this.open;
  }
}

function setup() {
  const map = new FakeMap();
  let control: FakeControl | null = new FakeControl();
  const root = {
    querySelector: ((sel: string) =>
      sel === ".maplibregl-ctrl-attrib.maplibregl-compact" &&
      control?.classes.has("maplibregl-compact")
        ? control
        : null) as unknown as ParentNode["querySelector"],
  };
  const stop = collapseAttributionSoon(map as never, root);
  return {
    map,
    stop,
    control: () => control!,
    setControl: (c: FakeControl | null) => {
      control = c;
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the map credit", () => {
  it("waits five seconds, per the OSMF guidelines", () => {
    expect(ATTRIBUTION_OPEN_MS).toBe(5000);
  });

  it("shows the full credit when the map draws and folds it after 5 s", () => {
    const { map, control } = setup();
    map.fire("load");
    vi.advanceTimersByTime(4999);
    expect(control().shown, "still open at 4.999 s").toBe(true);
    vi.advanceTimersByTime(1);
    expect(control().shown, "folded at 5 s").toBe(false);
    expect(control().classes.has("maplibregl-compact"), "(i) stays").toBe(true);
  });

  it("starts the five seconds on the first styledata when load never fires", () => {
    const { map, control } = setup();
    vi.advanceTimersByTime(1000);
    map.fire("styledata");
    vi.advanceTimersByTime(ATTRIBUTION_OPEN_MS - 1);
    expect(control().shown, "open five seconds from the first draw").toBe(true);
    vi.advanceTimersByTime(1);
    expect(control().shown, "folded").toBe(false);
  });

  it("starts the five seconds on the first idle too", () => {
    const { map, control } = setup();
    map.fire("idle");
    vi.advanceTimersByTime(ATTRIBUTION_OPEN_MS);
    expect(control().shown).toBe(false);
  });

  it("shows a credit that arrives late, on a slow network, for the full five seconds", () => {
    const { map, control, setControl } = setup();
    const late = control();
    setControl(null);
    map.fire("styledata");
    map.fire("load");
    vi.advanceTimersByTime(6000);
    setControl(late);
    map.fire("sourcedata");
    expect(late.shown, "open as soon as it appears").toBe(true);
    vi.advanceTimersByTime(ATTRIBUTION_OPEN_MS - 1);
    map.fire("data");
    expect(late.shown, "still open just under five seconds later").toBe(true);
    vi.advanceTimersByTime(1);
    expect(late.shown, "folded").toBe(false);
  });

  it("keeps nothing running while it waits for the credit", () => {
    const { map, setControl } = setup();
    setControl(null);
    map.fire("load");
    expect(vi.getTimerCount(), "no timer before the credit shows").toBe(0);
  });

  it("does not restart the five seconds when the style reloads", () => {
    const { map, control } = setup();
    map.fire("styledata");
    vi.advanceTimersByTime(4000);
    map.fire("styledata");
    map.fire("load");
    vi.advanceTimersByTime(1000);
    expect(control().shown, "folded five seconds after the first").toBe(false);
  });

  it("folds at once on the first pan or zoom by the user", () => {
    const { map, control } = setup();
    map.fire("load");
    map.fire("movestart", { originalEvent: {} });
    expect(control().shown).toBe(false);
  });

  it("folds at once on a tap on the map", () => {
    const { map, control } = setup();
    map.fire("click", { originalEvent: {} });
    expect(control().shown).toBe(false);
  });

  it("ignores camera moves the app makes itself", () => {
    const { map, control } = setup();
    map.fire("load");
    map.fire("movestart");
    expect(control().shown).toBe(true);
  });

  it("folds once and lets a tap on (i) reopen it for good", () => {
    const { map, control } = setup();
    map.fire("load");
    vi.advanceTimersByTime(ATTRIBUTION_OPEN_MS);
    expect(map.listeners(), "no listeners left").toBe(0);
    control().classes.add("maplibregl-compact-show");
    control().open = true;
    map.fire("movestart", { originalEvent: {} });
    map.fire("data");
    vi.advanceTimersByTime(ATTRIBUTION_OPEN_MS);
    expect(control().shown, "reopened by the reader").toBe(true);
  });

  it("folds the credit when it turns compact after an early interaction", () => {
    const { map, control, setControl } = setup();
    const late = control();
    setControl(null);
    map.fire("movestart", { originalEvent: {} });
    setControl(late);
    map.fire("data");
    expect(late.shown).toBe(false);
  });

  it("stops the timer and its listeners when the map is disposed", () => {
    const { map, stop, control } = setup();
    map.fire("load");
    stop();
    expect(map.listeners()).toBe(0);
    vi.advanceTimersByTime(ATTRIBUTION_OPEN_MS * 2);
    expect(control().shown).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
