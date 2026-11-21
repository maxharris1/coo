import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Bird, type Pose } from "@/components/Bird";
import type { SyncState } from "@/components/SyncProvider";
import type { SyncPayload } from "@/components/sync";
import PigeonPage from "./page";
import { poseFor } from "./pigeon";

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
    sulking: false,
    status: "home",
    busyKind: null,
    busyUntil: null,
    gear: ["goggles"],
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

const syncWith = (data: SyncPayload | null, refresh: () => void = () => {}) => {
  sync.current = {
    data,
    error: null,
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

describe("Pigeon mood (ac-1)", () => {
  it("picks the pose from the bird's state", () => {
    const cases: [Record<string, unknown>, Pose][] = [
      [{}, "perched"],
      [{ status: "flying" }, "fly"],
      [{ status: "busy", busyKind: "nap" }, "sleep"],
      [{ status: "busy", busyKind: "bath" }, "perched"],
      [{ sulking: true, hungry: true }, "sulk"],
      [{ hungry: true }, "surprise"],
      [{ status: "visiting", hungry: true }, "landed"],
      [{ status: "scheduled" }, "perched"],
      [{ scruffy: true }, "perched"],
      [{ tired: true }, "perched"],
    ];
    for (const [over, pose] of cases) {
      expect(poseFor(gerald(over)), JSON.stringify(over)).toBe(pose);
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
      { status: "busy", busyKind: "nap" },
      { status: "busy", busyKind: "bath" },
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

describe("Pigeon states", () => {
  it("shows the loader until the first sync lands", () => {
    expect(render(null)).toContain('aria-busy="true"');
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
