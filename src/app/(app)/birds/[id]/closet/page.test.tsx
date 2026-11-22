import { readFileSync } from "node:fs";
import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Bird } from "@/components/Bird";
import type { SyncState } from "@/components/SyncProvider";
import type { SyncPayload } from "@/components/sync";
import { ClosetTile } from "./ClosetTile";
import ClosetPage from "./page";
import { WeatherTip } from "./WeatherTip";
import { putGear } from "./wear";

const sync = vi.hoisted(() => ({ current: null as unknown }));
const route = vi.hoisted(() => ({ id: "g" }));
const hooks = vi.hoisted(() => {
  const slots: unknown[] = [];
  let at = 0;
  return {
    slots,
    begin: () => void (at = 0),
    useState<T>(init: T) {
      const i = at++;
      if (!(i in slots)) slots[i] = init;
      const set = (v: T) => void (slots[i] = v);
      return [slots[i] as T, set] as const;
    },
    useRef<T>(init: T) {
      const i = at++;
      if (!(i in slots)) slots[i] = { current: init };
      return slots[i] as { current: T };
    },
  };
});
const toasts = vi.hoisted(() => [] as string[]);

vi.mock("react", async (actual) => ({
  ...(await actual<typeof import("react")>()),
  useState: hooks.useState,
  useRef: hooks.useRef,
}));
vi.mock("@/components/SyncProvider", () => ({ useSync: () => sync.current }));
vi.mock("@/components/Toasts", () => ({
  useToast: () => (message: string) => void toasts.push(message),
}));
vi.mock("next/navigation", () => ({ useParams: () => ({ id: route.id }) }));

type ClosetBird = SyncPayload["birds"][number];

const bird = (over: Record<string, unknown>) =>
  ({
    id: "g",
    name: "Gerald",
    breed: "city",
    look: "gerald",
    pronoun: "he",
    status: "home",
    busyUntil: null,
    gear: [],
    ...over,
  }) as unknown as ClosetBird;

const NOW = Date.parse("2026-11-20T19:00:00Z");

const gerald = bird({ gear: ["goggles", "band"] });
const kevin = bird({ id: "k", name: "Kevin", look: "kevin", gear: ["scarf"] });
const brenda = bird({
  id: "b",
  name: "Brenda",
  look: "brenda",
  status: "flying",
  gear: ["bell"],
});

type Outfit = SyncPayload["outfits"][number];

const payload = (
  birds: ClosetBird[],
  closet: string[],
  outfits: Outfit[] = [],
): SyncPayload =>
  ({
    me: { seeds: 12, perches: 3, timezone: "UTC", loft: null },
    serverNow: NOW,
    birds,
    closet,
    flights: [],
    myVisiting: [],
    egg: null,
    outfits,
  }) as unknown as SyncPayload;

const CLOSET = ["goggles", "band", "beanie", "scarf", "bell"];

let refresh = vi.fn();

const syncWith = (data: SyncPayload | null, error: string | null = null) => {
  sync.current = { data, error, offsetMs: 0, refresh } satisfies SyncState;
};

const page = () => {
  hooks.begin();
  return ClosetPage();
};

const render = (data: SyncPayload | null, error: string | null = null) => {
  syncWith(data, error);
  hooks.begin();
  return renderToStaticMarkup(<ClosetPage />);
};

type Props = {
  children?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  "aria-pressed"?: boolean;
  href?: string;
};

const elements = (node: ReactNode): ReactElement<Props>[] => {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as ReactElement<Props>;
  if (el.type === ClosetTile)
    return elements(ClosetTile(el.props as Parameters<typeof ClosetTile>[0]));
  return [el, ...elements(el.props.children)];
};

const text = (node: ReactNode): string => {
  if (typeof node === "string" || typeof node === "number") return `${node}`;
  return elements(node)
    .map((el) => el.props.children)
    .flatMap((c) => (Array.isArray(c) ? c : [c]))
    .filter((c) => typeof c === "string" || typeof c === "number")
    .join(" ");
};

const tile = (name: string) => {
  const found = elements(page()).find(
    (el) => el.type === "button" && text(el).includes(name),
  );
  if (!found) throw new Error(`no tile for ${name}`);
  return found;
};

const outfit = (name: string, items: string[]): Outfit => ({
  id: name,
  name,
  items,
});

const chip = (name: string) => {
  const found = elements(page()).find(
    (el) => el.type === "button" && el.props.children === name,
  );
  if (!found) throw new Error(`no outfit chip for ${name}`);
  return found;
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const css = readFileSync(new URL("./page.module.css", import.meta.url), "utf8");

beforeEach(() => {
  refresh = vi.fn();
  toasts.length = 0;
  hooks.slots.length = 0;
  route.id = "g";
  vi.unstubAllGlobals();
});

describe("/birds/[id]/closet (ac-1)", () => {
  const html = () => render(payload([gerald, kevin, brenda], CLOSET));

  it("titles the screen Flock closet with a way back and to the store", () => {
    expect(html()).toMatch(/<h1[^>]*>Flock closet<\/h1>/);
    expect(html()).toMatch(
      /<a[^>]*href="\/birds\/g"[^>]*aria-label="Back to Gerald"|<a[^>]*aria-label="Back to Gerald"[^>]*href="\/birds\/g"/,
    );
    expect(html()).toMatch(/<a[^>]*href="\/shop"[^>]*>Store<\/a>/);
  });

  it("shows the bird on its stand wearing the selection", () => {
    const portrait = renderToStaticMarkup(
      <Bird
        look="gerald"
        breed="city"
        gear={["goggles", "band"]}
        pose="perched"
        size={176}
        title="Gerald wearing the outfit you picked"
      />,
    );
    expect(html()).toContain(portrait);
  });

  it("lists what the worn items do, in slot order", () => {
    const out = html();
    expect(out).toContain("What it does");
    const rain = out.indexOf("Holds full speed in rain");
    const odds = out.indexOf("better arrival odds");
    expect(rain).toBeGreaterThan(-1);
    expect(odds).toBeGreaterThan(rain);
  });

  it("says nothing is on when the bird wears nothing", () => {
    const out = render(payload([bird({ gear: [] })], CLOSET));
    expect(out).toContain("Nothing on yet.");
  });

  it("tells you the closet is shared and who you are dressing", () => {
    expect(html()).toMatch(/<h2[^>]*>Closet<\/h2>/);
    expect(html()).toContain("Shared by every bird. Tap to dress Gerald.");
  });

  it("marks worn, owned and borrowed items in the grid", () => {
    syncWith(payload([gerald, kevin, brenda], CLOSET));
    expect(tile("goggles").props["aria-pressed"]).toBe(true);
    expect(text(tile("goggles"))).toContain("Wearing");
    expect(tile("beanie").props["aria-pressed"]).toBe(false);
    expect(text(tile("beanie"))).toContain("Owned");
    expect(text(tile("scarf"))).toContain("On Kevin");
    expect(text(tile("bell"))).toContain("On Brenda");
  });

  it("will not take an item from a bird that is away", () => {
    syncWith(payload([gerald, kevin, brenda], CLOSET));
    expect(tile("bell").props.disabled).toBe(true);
    expect(tile("scarf").props.disabled).toBeFalsy();
  });

  it("shows an unowned item's price and links it to the store", () => {
    const out = html();
    expect(out).toMatch(
      /<a[^>]*href="\/shop"[^>]*aria-label="Rain hat, 120 seeds in the store"|<a[^>]*aria-label="Rain hat, 120 seeds in the store"[^>]*href="\/shop"/,
    );
    expect(out).toContain("120 seeds");
  });

  it("puts tomorrow's weather tip between the stand and the closet", () => {
    syncWith(payload([gerald, kevin, brenda], CLOSET));
    const all = elements(page());
    const tip = all.findIndex((el) => el.type === WeatherTip);
    expect(tip).toBeGreaterThan(
      all.findIndex((el) => el.props.children === "What it does"),
    );
    expect(tip).toBeLessThan(
      all.findIndex((el) => el.props.children === "Closet"),
    );
    expect(all[tip].props).toMatchObject({
      pronoun: "he",
      worn: ["goggles", "band"],
    });
  });

  it("shows no tip before the forecast arrives", () => {
    expect(html()).not.toContain("Dress him");
  });

  it("lists closet items before store items, as drawn", () => {
    const out = html();
    expect(out.indexOf("Ankle bell")).toBeLessThan(out.indexOf("Rain hat"));
  });

  it("tapping an owned item PUTs the new gear and refetches", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ bird: {}, skipped: [] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    syncWith(payload([gerald, kevin, brenda], CLOSET));
    tile("beanie").props.onClick?.();
    await flush();
    expect(fetchMock).toHaveBeenCalledWith("/api/birds/g/gear", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items: ["band", "beanie"] }),
    });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("tapping a worn item takes it off", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ bird: {}, skipped: [] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    syncWith(payload([gerald, kevin, brenda], CLOSET));
    tile("goggles").props.onClick?.();
    await flush();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/birds/g/gear",
      expect.objectContaining({ body: JSON.stringify({ items: ["band"] }) }),
    );
    expect(refresh).toHaveBeenCalledOnce();
  });

  describe("successive taps before the refetch lands (f-1)", () => {
    const bare = bird({ gear: [] });
    const deferredFetch = () => {
      const bodies: unknown[] = [];
      const answers: (() => void)[] = [];
      const fetchMock = vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((resolve) => {
            bodies.push(JSON.parse(String(init?.body)));
            answers.push(() =>
              resolve(Response.json({ bird: {}, skipped: [] })),
            );
          }),
      );
      vi.stubGlobal("fetch", fetchMock);
      const answerAll = async () => {
        while (answers.length) {
          answers.shift()!();
          await flush();
        }
      };
      return { bodies, answerAll };
    };

    it("keeps goggles when scarf is tapped next", async () => {
      const { bodies, answerAll } = deferredFetch();
      syncWith(payload([bare], ["goggles", "scarf"]));
      tile("goggles").props.onClick?.();
      tile("scarf").props.onClick?.();
      await flush();
      await answerAll();
      expect(bodies.at(-1)).toEqual({ items: ["goggles", "scarf"] });
      expect(refresh).toHaveBeenCalledOnce();
    });

    it("keeps goggles even when both taps come from one render", async () => {
      const { bodies, answerAll } = deferredFetch();
      syncWith(payload([bare], ["goggles", "scarf"]));
      const goggles = tile("goggles");
      const scarf = tile("scarf");
      goggles.props.onClick?.();
      scarf.props.onClick?.();
      await flush();
      await answerAll();
      expect(bodies).toEqual([
        { items: ["goggles"] },
        { items: ["goggles", "scarf"] },
      ]);
    });

    it("shows the pending selection on the stand and in the grid", () => {
      deferredFetch();
      syncWith(payload([bare], ["goggles", "scarf"]));
      tile("goggles").props.onClick?.();
      expect(tile("goggles").props["aria-pressed"]).toBe(true);
      hooks.begin();
      expect(renderToStaticMarkup(<ClosetPage />)).not.toContain(
        "Nothing on yet.",
      );
    });

    it("does not carry one bird's pending gear to another", async () => {
      const { bodies, answerAll } = deferredFetch();
      const otherBare = bird({ id: "k", name: "Kevin", gear: [] });
      syncWith(payload([bare, otherBare], ["goggles", "scarf"]));
      tile("goggles").props.onClick?.();
      route.id = "k";
      expect(tile("goggles").props["aria-pressed"]).toBe(false);
      tile("scarf").props.onClick?.();
      await flush();
      await answerAll();
      expect(bodies).toEqual([{ items: ["goggles"] }, { items: ["scarf"] }]);
    });

    it("waits for a pending tile save before wearing an outfit", async () => {
      const { bodies, answerAll } = deferredFetch();
      syncWith(
        payload(
          [bare],
          ["goggles", "scarf", "beanie"],
          [outfit("Cold snap", ["beanie", "scarf"])],
        ),
      );
      tile("goggles").props.onClick?.();
      chip("Cold snap").props.onClick?.();
      await flush();
      expect(bodies).toEqual([{ items: ["goggles"] }]);
      await answerAll();
      expect(bodies).toEqual([
        { items: ["goggles"] },
        { outfitId: "Cold snap" },
      ]);
      expect(refresh).toHaveBeenCalledOnce();
    });

    it("dresses on top of an outfit still saving", async () => {
      const { bodies, answerAll } = deferredFetch();
      syncWith(
        payload([bare], ["goggles", "scarf"], [outfit("Cosy", ["scarf"])]),
      );
      chip("Cosy").props.onClick?.();
      expect(chip("Cosy").props["aria-pressed"]).toBe(true);
      tile("goggles").props.onClick?.();
      await flush();
      await answerAll();
      expect(bodies).toEqual([
        { outfitId: "Cosy" },
        { items: ["scarf", "goggles"] },
      ]);
    });

    it("drops the pending selection once fresh sync data arrives", async () => {
      const { answerAll } = deferredFetch();
      syncWith(payload([bare], ["goggles", "scarf"]));
      tile("goggles").props.onClick?.();
      await answerAll();
      syncWith(payload([bird({ gear: ["scarf"] })], ["goggles", "scarf"]));
      expect(tile("goggles").props["aria-pressed"]).toBe(false);
      expect(tile("scarf").props["aria-pressed"]).toBe(true);
    });
  });

  describe("saved outfits", () => {
    const withOutfits = (...outfits: Outfit[]) =>
      syncWith(payload([gerald, kevin, brenda], CLOSET, outfits));
    const okFetch = (skipped: string[] = []) => {
      const fetchMock = vi.fn(async () => Response.json({ bird: {}, skipped }));
      vi.stubGlobal("fetch", fetchMock);
      return fetchMock;
    };
    const stand = () =>
      elements(page()).find((el) => el.type === Bird)?.props as {
        gear: string[];
      };

    it("shows each outfit by name between the stand and the closet", () => {
      const out = render(
        payload([gerald, kevin, brenda], CLOSET, [
          outfit("Everyday", ["goggles", "band"]),
          outfit("Cold snap", ["beanie", "scarf"]),
        ]),
      );
      const heading = out.search(/<h2[^>]*>Saved outfits<\/h2>/);
      expect(heading).toBeGreaterThan(out.indexOf("What it does"));
      expect(heading).toBeLessThan(out.search(/<h2[^>]*>Closet<\/h2>/));
      expect(out).toMatch(/<button[^>]*type="button"[^>]*>Everyday<\/button>/);
      expect(out).toMatch(/<button[^>]*>Cold snap<\/button>/);
    });

    it("leaves the section out when there are no saved outfits", () => {
      expect(render(payload([gerald, kevin, brenda], CLOSET))).not.toContain(
        "Saved outfits",
      );
    });

    it("tapping an outfit PUTs its id and refetches", async () => {
      const fetchMock = okFetch();
      withOutfits(outfit("Cold snap", ["beanie", "band"]));
      chip("Cold snap").props.onClick?.();
      await flush();
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(fetchMock).toHaveBeenCalledWith("/api/birds/g/gear", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ outfitId: "Cold snap" }),
      });
      expect(refresh).toHaveBeenCalledOnce();
    });

    it("previews the outfit without an unowned item or an item on a bird that is away", () => {
      okFetch();
      withOutfits(outfit("Cold snap", ["rainhat", "beanie", "bell"]));
      chip("Cold snap").props.onClick?.();
      expect(stand().gear).toEqual(["beanie"]);
    });

    it("previews an item taken off a bird that is home", () => {
      okFetch();
      withOutfits(outfit("Cosy", ["scarf"]));
      chip("Cosy").props.onClick?.();
      expect(stand().gear).toEqual(["scarf"]);
    });

    it("names the items the server skipped", async () => {
      okFetch(["scarf", "rainhat"]);
      withOutfits(outfit("Cold snap", ["rainhat", "beanie", "scarf"]));
      chip("Cold snap").props.onClick?.();
      await flush();
      expect(toasts).toEqual([
        "Gerald has the outfit on without the Thermal scarf and Rain hat.",
      ]);
    });

    it("says nothing when the server skipped nothing", async () => {
      okFetch();
      withOutfits(outfit("Cosy", ["beanie"]));
      chip("Cosy").props.onClick?.();
      await flush();
      expect(toasts).toEqual([]);
    });

    it("presses the outfit the bird is wearing, in any order", () => {
      withOutfits(
        outfit("Everyday", ["band", "goggles"]),
        outfit("Cold snap", ["beanie", "scarf"]),
        outfit("Just goggles", ["goggles"]),
      );
      expect(chip("Everyday").props["aria-pressed"]).toBe(true);
      expect(chip("Cold snap").props["aria-pressed"]).toBe(false);
      expect(chip("Just goggles").props["aria-pressed"]).toBe(false);
    });

    it("cannot wear an outfit with nothing free to put on", () => {
      const fetchMock = okFetch();
      syncWith(
        payload([bird({ gear: [] }), brenda], CLOSET, [
          outfit("Away", ["rainhat", "bell"]),
        ]),
      );
      expect(chip("Away").props["aria-pressed"]).toBe(false);
      expect(chip("Away").props.disabled).toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  it("toasts the server's refusal and still refetches", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          {
            error: {
              code: "conflict",
              message: "Gerald is not home right now.",
            },
          },
          { status: 409 },
        ),
      ),
    );
    syncWith(payload([gerald, kevin, brenda], CLOSET));
    tile("scarf").props.onClick?.();
    await flush();
    expect(toasts).toEqual(["Gerald is not home right now."]);
    expect(refresh).toHaveBeenCalledOnce();
  });
});

describe("/birds/[id]/closet states", () => {
  it("shows the loader while sync is pending", () => {
    expect(render(null)).toContain('aria-busy="true"');
  });

  it("shows the sync error with a retry", () => {
    const out = render(null, "We could not reach the loft. Try again.");
    expect(out).toContain("We could not reach the loft. Try again.");
    expect(out).toContain("Try again</button>");
  });

  it("says so when the bird is not in the flock", () => {
    expect(render(payload([kevin], CLOSET))).toContain(
      "Could not find that bird.",
    );
  });
});

describe("putGear", () => {
  it("says the loft is unreachable when fetch throws", async () => {
    await expect(
      putGear("g", { items: [] }, async () => {
        throw new Error("offline");
      }),
    ).rejects.toThrow("We could not reach the loft. Try again.");
  });
});

describe("/birds/[id]/closet looks (ac-2)", () => {
  it("draws the stand in sky and store tiles dashed on sand", () => {
    expect(css).toMatch(/\.stand\s*{[^}]*background:\s*var\(--coo-sky\)/);
    expect(css).toMatch(/\.store\s*{[^}]*dashed/);
    expect(css).toMatch(/\.store\s*{[^}]*var\(--coo-sand\)/);
    expect(css).toMatch(/\.wearing\s*{[^}]*var\(--coo-sun\)/);
  });

  it("lays the closet out four across with 44 px tap targets", () => {
    expect(css).toMatch(/\.grid\s*{[^}]*repeat\(4,/);
    expect(css).toMatch(/\.back\s*{[^}]*var\(--coo-touch\)/);
    expect(css).toMatch(/\.storeLink\s*{[^}]*min-height:\s*var\(--coo-touch\)/);
  });

  it("draws the weather tip as a sun band with a raised 44 px button", () => {
    expect(css).toMatch(/\.tip\s*{[^}]*background:\s*var\(--coo-sun\)/);
    expect(css).toMatch(/\.tipButton\s*{[^}]*min-height:\s*var\(--coo-touch\)/);
    expect(css).toMatch(/\.tipButton\s*{[^}]*background:\s*var\(--coo-card\)/);
    expect(css).toMatch(
      /\.tipButton\s*{[^}]*box-shadow:\s*var\(--coo-shadow-1\)/,
    );
  });

  it("lays saved outfits three across as touch-sized pills, sun when worn", () => {
    expect(css).toMatch(/\.chips\s*{[^}]*repeat\(3, minmax\(0, 1fr\)\)/);
    expect(css).toMatch(/\.chip\s*{[^}]*min-height:\s*var\(--coo-touch\)/);
    expect(css).toMatch(/\.chip\s*{[^}]*var\(--coo-radius-pill\)/);
    expect(css).toMatch(
      /\.chip\[aria-pressed="true"\]\s*{[^}]*background:\s*var\(--coo-sun\)[^}]*var\(--coo-shadow-2\)/,
    );
  });
});
