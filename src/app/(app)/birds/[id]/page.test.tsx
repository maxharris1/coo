import { readFileSync } from "node:fs";
import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Bird, type Pose } from "@/components/Bird";
import type { SyncState } from "@/components/SyncProvider";
import type { SyncPayload } from "@/components/sync";
import PigeonPage from "./page";
import type { BirdPosition } from "@/lib/flight/engine";
import { moodLine, poseFor } from "./pigeon";

const sync = vi.hoisted(() => ({ current: null as unknown }));
const toasts = vi.hoisted(() => [] as string[]);

vi.mock("@/components/SyncProvider", () => ({ useSync: () => sync.current }));
vi.mock("@/components/Toasts", () => ({
  useToast: () => (message: string) => void toasts.push(message),
}));
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "g" }) }));

type PigeonBird = SyncPayload["birds"][number];

const gerald = (over: Record<string, unknown> = {}) =>
  ({
    id: "g",
    name: "Gerald",
    breed: "city",
    look: "gerald",
    pronoun: "he",
    level: 4,
    belly: 80,
    feathers: 40,
    energy: 90,
    hungry: false,
    scruffy: false,
    tired: false,
    canFly: true,
    sulking: false,
    status: "home",
    busyKind: null,
    busyUntil: null,
    gear: ["goggles"],
    speedMph: 45,
    focus: 2,
    navigation: 4,
    quirks: ["Afraid of statues", "Loves New Jersey"],
    deliveries: 37,
    detours: 2,
    ...over,
  }) as unknown as PigeonBird;

const NOW = Date.parse("2026-11-20T19:00:00Z");

const payload = (
  birds: PigeonBird[],
  extra: Record<string, unknown> = {},
): SyncPayload =>
  ({
    me: { seeds: 12, perches: 3, timezone: "UTC", loft: null },
    serverNow: NOW,
    birds,
    flights: [],
    myVisiting: [],
    egg: null,
    ...extra,
  }) as unknown as SyncPayload;

const syncWith = (
  data: SyncPayload | null,
  refresh: () => void = () => {},
  error: string | null = null,
) => {
  sync.current = {
    data,
    error,
    offsetMs: 0,
    refresh,
  } satisfies SyncState;
};

const render = (data: SyncPayload | null) => {
  syncWith(data);
  return renderToStaticMarkup(<PigeonPage />);
};

type Props = {
  children?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
};

const elements = (node: ReactNode): ReactElement<Props>[] => {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as ReactElement<Props>;
  return [el, ...elements(el.props.children)];
};

const portrait = (pose: Pose) =>
  renderToStaticMarkup(
    <Bird
      look="gerald"
      breed="city"
      gear={["goggles"]}
      pose={pose}
      size={168}
      title="Gerald"
    />,
  );

const tripFrom = { lat: 40.7, lon: -74, label: "Brooklyn" };
const tripTo = { lat: 34.05, lon: -118.24, label: "Los Angeles" };
const HOUR = 3_600_000;

const tripPlan = (segments: [string, number, number][]) => ({
  distanceMi: 2450,
  bearingDeg: 270,
  onTimeOdds: 0.9,
  delayed: false,
  delayKind: null,
  arriveAtMs: NOW + segments[segments.length - 1][2] * HOUR,
  segments: segments.map(([kind, from, to], i) => ({
    kind,
    startMs: NOW + from * HOUR,
    endMs: NOW + to * HOUR,
    fromFrac: i / segments.length,
    toFrac: (i + 1) / segments.length,
  })),
  events: [],
});

const onTrip = (atHour: number) =>
  payload([gerald({ status: "flying" })], {
    serverNow: NOW + atHour * HOUR,
    flights: [
      {
        id: "f1",
        kind: "delivery",
        status: "flying",
        role: "mine",
        bird: { id: "g", name: "Gerald" },
        owner: { id: "u", name: "Me" },
        counterpart: { id: "m", name: "Maya" },
        from: tripFrom,
        to: tripTo,
        releaseAt: NOW,
        arriveAt: NOW + 30 * HOUR,
        plan: tripPlan([
          ["fly", 0, 10],
          ["roost", 10, 20],
          ["fly", 20, 30],
        ]),
      },
    ],
  });

const button = (label: string) =>
  elements(PigeonPage()).find(
    (el) => el.type === "button" && el.props.children === label,
  );

describe("Pigeon header (ac-1)", () => {
  const html = render(payload([gerald()]));

  it("links back to the loft", () => {
    expect(html).toMatch(
      /<a(?=[^>]*href="\/")(?=[^>]*aria-label="Back to the loft")/,
    );
  });

  it("shows the level pill, the name and the mood", () => {
    expect(html).toContain(">Level 4 city pigeon<");
    expect(html).toMatch(/<h1[^>]*>Gerald<\/h1>/);
    expect(html).toContain("Feeling smug. Fed, preened and ready to fly.");
  });

  it("opens his closet", () => {
    expect(html).toMatch(
      /<a[^>]*href="\/birds\/g\/closet"[^>]*>Open his closet<\/a>/,
    );
  });

  it("says her and their closet for those pronouns", () => {
    expect(render(payload([gerald({ pronoun: "she" })]))).toContain(
      ">Open her closet<",
    );
    expect(render(payload([gerald({ pronoun: "they" })]))).toContain(
      ">Open their closet<",
    );
  });

  it("draws the bird in its gear, labelled by name", () => {
    expect(html).toContain(
      renderToStaticMarkup(
        <Bird
          look="gerald"
          breed="city"
          gear={["goggles"]}
          pose="perched"
          size={168}
          title="Gerald"
        />,
      ),
    );
  });
});

describe("Pigeon care meters (ac-1)", () => {
  const html = render(payload([gerald()]));

  it("labels each meter with its value", () => {
    expect(html).toContain("How he&#x27;s doing");
    expect(html).toContain('role="img" aria-label="Belly 80 percent full"');
    expect(html).toContain('role="img" aria-label="Feathers 40 percent clean"');
    expect(html).toContain('role="img" aria-label="Energy 90 percent"');
  });

  it("fills each bar to its value and turns it coral under half full", () => {
    const fills = [
      ...html.matchAll(/<div class="([^"]*)" style="width:(\d+)%"/g),
    ];
    expect(fills.map((m) => m[2])).toEqual(["80", "40", "90"]);
    expect(fills.map((m) => /low/.test(m[1]))).toEqual([false, true, false]);
  });

  it("offers Feed, Bath and Nap", () => {
    for (const label of ["Feed", "Bath", "Nap"]) {
      expect(html).toMatch(new RegExp(`<button[^>]*>${label}</button>`));
      expect(button(label)?.props.disabled).toBe(false);
    }
  });

  it("explains sulking in the bird's pronoun", () => {
    expect(html).toContain(
      "Skip a few days and he sulks and flies slower. He never leaves.",
    );
    expect(render(payload([gerald({ pronoun: "they" })]))).toContain(
      "Skip a few days and they sulk and fly slower. They never leave.",
    );
  });
});

describe("Pigeon abilities (ac-1)", () => {
  const html = render(payload([gerald()]));

  const dots = (html: string, label: string) => {
    const svg = new RegExp(
      `role="img" aria-label="${label}"[^>]*>(.*?)</svg>`,
    ).exec(html)?.[1];
    return [...(svg ?? "").matchAll(/<circle[^>]*class="([^"]*)"/g)].map((m) =>
      /filled/.test(m[1]),
    );
  };

  it("heads the section in the bird's pronoun", () => {
    expect(html).toMatch(/<h2[^>]*>What he can do<\/h2>/);
    expect(render(payload([gerald({ pronoun: "she" })]))).toMatch(
      /<h2[^>]*>What she can do<\/h2>/,
    );
    expect(render(payload([gerald({ pronoun: "they" })]))).toMatch(
      /<h2[^>]*>What they can do<\/h2>/,
    );
  });

  it("shows base speed and the range before a rest", () => {
    expect(html).toMatch(/>Speed<\/span><span[^>]*>45 mph</);
    expect(html).toMatch(/>Range before a rest<\/span><span[^>]*>320 miles</);
  });

  it("draws navigation and focus as five dots, the first few filled", () => {
    expect(html).toContain(">Navigation, 4 of 5<");
    expect(html).toContain(">Focus, 2 of 5 (bread)<");
    expect(dots(html, "Navigation 4 of 5")).toEqual([
      true,
      true,
      true,
      true,
      false,
    ]);
    expect(dots(html, "Focus 2 of 5")).toEqual([
      true,
      true,
      false,
      false,
      false,
    ]);
  });

  it("only city pigeons focus for bread", () => {
    const html = render(payload([gerald({ breed: "king", focus: 3 })]));
    expect(html).toContain(">Focus, 3 of 5<");
    expect(html).not.toContain("(bread)");
  });

  it("shows each quirk as a chip", () => {
    expect(html).toMatch(
      /<ul[^>]*><li[^>]*>Afraid of statues<\/li><li[^>]*>Loves New Jersey<\/li><\/ul>/,
    );
  });

  it("states the record, and no note is ever lost", () => {
    expect(html).toContain(">37 deliveries. 2 detours. 0 notes lost.<");
    expect(render(payload([gerald({ deliveries: 1, detours: 1 })]))).toContain(
      ">1 delivery. 1 detour. 0 notes lost.<",
    );
  });

  it("spaces each card like the reference: only the dot cards get a gap", () => {
    const reference = readFileSync(
      new URL(
        "../../../../../reference/screens/html/Pigeon.html",
        import.meta.url,
      ),
      "utf8",
    );
    const css = readFileSync(
      new URL("./page.module.css", import.meta.url),
      "utf8",
    );
    const gapOf = (style: string) =>
      /gap:\s*([^;]+)/.exec(style)?.[1].trim() ?? "0px";
    const cardGap = (label: string) => {
      const classes = new RegExp(
        `<div class="([^"]*)"><span[^>]*>${label}`,
      ).exec(html)?.[1];
      const rules = (classes ?? "")
        .split(" ")
        .map((token) => /^_(\w+)_[0-9a-f]+$/.exec(token)?.[1])
        .flatMap((name) =>
          [...css.matchAll(new RegExp(`\\.${name}\\s*\\{([^}]*)\\}`, "g"))].map(
            (m) => m[1],
          ),
        );
      return gapOf(rules.join(";"));
    };
    const referenceGap = (label: string) =>
      gapOf(
        new RegExp(`<div style="([^"]*)"><span[^>]*>${label}`).exec(
          reference,
        )?.[1] ?? "missing",
      );
    for (const label of ["Speed", "Range", "Navigation", "Focus"]) {
      expect({ label, gap: cardGap(label) }).toEqual({
        label,
        gap: referenceGap(label),
      });
    }
  });
});

describe("Pigeon mood (ac-1)", () => {
  it("picks the pose from the bird's state", () => {
    const cases: [Record<string, unknown>, Pose][] = [
      [{}, "perched"],
      [{ status: "flying" }, "fly"],
      [{ status: "busy", busyKind: "nap" }, "sleep"],
      [{ status: "busy", busyKind: "bath" }, "perched"],
      [{ status: "busy", busyKind: "job" }, "perched"],
      [{ sulking: true, hungry: true }, "sulk"],
      [{ hungry: true }, "surprise"],
      [{ status: "visiting", hungry: true }, "landed"],
      [{ status: "scheduled" }, "perched"],
      [{ scruffy: true }, "perched"],
      [{ tired: true }, "perched"],
      [{ tired: true, canFly: false }, "perched"],
    ];
    for (const [over, pose] of cases) {
      expect(poseFor(gerald(over)), JSON.stringify(over)).toBe(pose);
    }
  });

  it("flies only while the trip is moving along a segment", () => {
    const flying = gerald({ status: "flying" });
    const cases: [BirdPosition["state"], Pose, string][] = [
      ["waiting", "perched", "Packed and waiting to leave."],
      ["flying", "fly", "Out on a delivery."],
      ["roosting", "sleep", "Roosting for the night."],
      ["delayed", "perched", "Running late."],
      ["landed", "landed", "Landed."],
    ];
    for (const [trip, pose, mood] of cases) {
      expect(poseFor(flying, trip), trip).toBe(pose);
      expect(moodLine(flying, trip), trip).toContain(mood);
    }
  });

  it("draws the portrait in that pose", () => {
    const html = render(payload([gerald({ status: "flying" })]));
    expect(html).toContain(
      renderToStaticMarkup(
        <Bird
          look="gerald"
          breed="city"
          gear={["goggles"]}
          pose="fly"
          size={168}
          title="Gerald"
        />,
      ),
    );
  });

  it("says a different line for each state", () => {
    const lines = [
      {},
      { hungry: true },
      { sulking: true },
      { scruffy: true },
      { tired: true },
      { tired: true, canFly: false },
      { status: "busy", busyKind: "nap" },
      { status: "busy", busyKind: "bath" },
      { status: "busy", busyKind: "job" },
      { status: "flying" },
      { status: "visiting" },
      { status: "scheduled" },
    ].map((over) => {
      const html = render(payload([gerald(over)]));
      return /<h1[^>]*>Gerald<\/h1><p[^>]*>([^<]+)<\/p>/.exec(html)?.[1];
    });
    expect(lines.every(Boolean)).toBe(true);
    expect(new Set(lines).size).toBe(lines.length);
    expect(lines[1]).toBe("Hungry. Has opinions about it.");
  });

  it("says a bird on an odd job is working", () => {
    const html = render(payload([gerald({ status: "busy", busyKind: "job" })]));
    expect(/<h1[^>]*>Gerald<\/h1><p[^>]*>([^<]+)<\/p>/.exec(html)?.[1]).toBe(
      "On an odd job. Very professional about it.",
    );
  });
});

describe("Pigeon care taps (ac-1)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    toasts.length = 0;
  });

  const tap = async (label: string, response: Response) => {
    const calls: string[] = [];
    const bodies: (BodyInit | null | undefined)[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push(`${init?.method} ${url}`);
        bodies.push(init?.body);
        return response;
      }),
    );
    const refreshed = new Promise<void>((resolve) =>
      syncWith(payload([gerald()]), () => {
        calls.push("refresh");
        resolve();
      }),
    );
    button(label)!.props.onClick!();
    await refreshed;
    return { calls, bodies };
  };

  it("Feed posts the feed endpoint with an action id, then refetches", async () => {
    const { calls, bodies } = await tap("Feed", Response.json({ ok: true }));
    expect(calls).toEqual(["POST /api/birds/g/feed", "refresh"]);
    expect(Object.keys(JSON.parse(String(bodies[0])))).toEqual(["actionId"]);
    expect(toasts).toEqual([]);
  });

  it("Bath and Nap post their endpoints, then refetch", async () => {
    for (const [label, path] of [
      ["Bath", "bath"],
      ["Nap", "nap"],
    ]) {
      const { calls, bodies } = await tap(label, Response.json({ ok: true }));
      expect(calls).toEqual([`POST /api/birds/g/${path}`, "refresh"]);
      expect(bodies[0]).toBeUndefined();
    }
    expect(toasts).toEqual([]);
  });

  it("toasts the server's message and still refetches when care fails", async () => {
    const { calls } = await tap(
      "Bath",
      Response.json(
        {
          error: { code: "conflict", message: "Gerald is not home right now." },
        },
        { status: 409 },
      ),
    );
    expect(calls).toEqual(["POST /api/birds/g/bath", "refresh"]);
    expect(toasts).toEqual(["Gerald is not home right now."]);
  });
});

describe("Pigeon away (ac-1)", () => {
  it("says where a flying bird is and disables care", () => {
    const html = render(
      payload([gerald({ status: "flying" })], {
        flights: [
          {
            id: "f1",
            kind: "delivery",
            status: "flying",
            role: "mine",
            bird: { id: "g", name: "Gerald" },
            owner: { id: "u", name: "Me" },
            counterpart: { id: "m", name: "Maya" },
            to: { label: "Newark" },
            releaseAt: NOW - 3_600_000,
            arriveAt: Date.parse("2026-11-20T19:30:00Z"),
          },
        ],
      }),
    );
    expect(html).toContain("To Maya in Newark, lands 7:30 pm");
    for (const label of ["Feed", "Bath", "Nap"]) {
      expect(html).toMatch(
        new RegExp(`<button[^>]*disabled=""[^>]*>${label}<`),
      );
      expect(button(label)?.props.disabled).toBe(true);
    }
  });

  it("says when a napping bird wakes and disables care", () => {
    const html = render(
      payload([
        gerald({
          status: "busy",
          busyKind: "nap",
          busyUntil: Date.parse("2026-11-20T19:20:00Z"),
        }),
      ]),
    );
    expect(html).toContain("Napping until 7:20 pm");
    expect(button("Nap")?.props.disabled).toBe(true);
  });
});

describe("Pigeon on a trip (ac-1, docs/08-design-system.md:92)", () => {
  const mood = (html: string) =>
    /<h1[^>]*>Gerald<\/h1><p[^>]*>([^<]+)<\/p>/.exec(html)?.[1];

  it("sleeps while the current segment is a roost", () => {
    const html = render(onTrip(15));
    expect(html).toContain(portrait("sleep"));
    expect(html).not.toContain(portrait("fly"));
    expect(mood(html)).toBe(
      "Roosting for the night. Back in the air at first light.",
    );
  });

  it("flies on either side of the roost", () => {
    for (const hour of [5, 25]) {
      const html = render(onTrip(hour));
      expect(html, `hour ${hour}`).toContain(portrait("fly"));
      expect(mood(html)).toBe("Out on a delivery. Taking it very seriously.");
    }
  });

  it("ignores another bird's roosting flight", () => {
    const data = onTrip(15);
    const flight = (data.flights as unknown as { bird: { id: string } }[])[0];
    flight.bird = { id: "other" };
    expect(render(data)).toContain(portrait("fly"));
  });
});

describe("Pigeon states", () => {
  it("shows the loader until the first sync lands", () => {
    expect(render(null)).toContain('aria-busy="true"');
  });

  it("explains a failed first sync and offers a retry", () => {
    let retried = 0;
    syncWith(null, () => retried++, "We could not reach the loft. Try again.");
    const html = renderToStaticMarkup(<PigeonPage />);
    expect(html).toMatch(
      /role="alert"[^>]*>We could not reach the loft. Try again.</,
    );
    expect(html).not.toContain('aria-busy="true"');
    button("Try again")!.props.onClick!();
    expect(retried).toBe(1);
  });

  it("keeps showing the bird when a later sync fails", () => {
    syncWith(payload([gerald()]), () => {}, "We could not reach the loft.");
    const html = renderToStaticMarkup(<PigeonPage />);
    expect(html).toMatch(/<h1[^>]*>Gerald<\/h1>/);
    expect(html).not.toContain('role="alert"');
  });

  it("says so when the bird is not in the flock", () => {
    const html = render(payload([gerald({ id: "other" })]));
    expect(html).toContain("Could not find that bird.");
    expect(html).toMatch(
      /<a(?=[^>]*href="\/")(?=[^>]*aria-label="Back to the loft")/,
    );
    expect(html).not.toContain("<button");
  });
});
