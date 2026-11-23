import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SyncPayload } from "@/components/sync";
import type { BirdRecord } from "@/server/rows";
import { toBirdView } from "@/server/services/sync";
import { Flock } from "./Flock";

type Bird = SyncPayload["birds"][number];

const bird = (name: string, over: Partial<Bird> = {}): Bird =>
  ({
    id: name.toLowerCase().replace(" ", "-"),
    name,
    look: "gerald",
    breed: "city",
    pronoun: "he",
    status: "home",
    hungry: false,
    tired: false,
    busyKind: null,
    busyUntil: null,
    gear: [],
    ...over,
  }) as Bird;

const now = Date.parse("2026-11-20T14:20:00Z");

const data = ({
  birds,
  perches = 5,
  egg = null,
  flights = [],
}: {
  birds: Bird[];
  perches?: number;
  egg?: { status: string; deliveriesToGo: number } | null;
  flights?: unknown[];
}) =>
  ({
    serverNow: now,
    me: { seeds: 240, perches, timezone: "America/New_York", loft: null },
    birds,
    flights,
    myVisiting: [],
    egg,
  }) as unknown as SyncPayload;

const render = (d: SyncPayload) =>
  renderToStaticMarkup(<Flock data={d} onFeed={() => {}} />).replaceAll(
    "&#x27;",
    "'",
  );

const mock = [
  bird("Gerald"),
  bird("Brenda", { look: "brenda", status: "flying" }),
  bird("Kevin", {
    look: "kevin",
    status: "busy",
    busyKind: "nap",
    busyUntil: Date.parse("2026-11-20T19:40:00Z"),
  }),
  bird("Admiral Crumbs", { look: "admiral", hungry: true, gear: ["cap"] }),
];

describe("Flock on Main", () => {
  it("lists each bird with name, status line and chip, linking to its page (ac-2)", () => {
    const html = render(data({ birds: mock }));
    for (const id of ["gerald", "brenda", "kevin", "admiral-crumbs"]) {
      expect(html).toContain(`href="/birds/${id}"`);
    }
    expect(html).toContain("Home, fed, smug");
    expect(html).toContain("Napping until this afternoon");
    expect(html).toMatch(/>Ready</);
    expect(html).toMatch(/>Flying</);
    expect(html).toMatch(/>Resting</);
    expect(html.match(/<svg/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("chips a bird on an odd job On a job and a napping bird Resting", () => {
    const until = Date.parse("2026-11-20T16:46:00Z");
    const html = render(
      data({
        birds: [
          bird("Gerald", { status: "busy", busyKind: "job", busyUntil: until }),
          bird("Kevin", { status: "busy", busyKind: "nap", busyUntil: until }),
        ],
      }),
    );
    const rows = html.match(/<li[^>]*>.*?<\/li>/g) ?? [];
    const row = (name: string) => rows.find((r) => r.includes(`>${name}<`));
    expect(row("Gerald")).toContain("On an odd job until around midday");
    expect(row("Gerald")).toMatch(/class="[^"]*sun[^"]*">On a job</);
    expect(row("Gerald")).not.toContain("Resting");
    expect(row("Kevin")).toContain("Napping until around midday");
    expect(row("Kevin")).toMatch(/class="[^"]*lilac[^"]*">Resting</);
  });

  it("gives a hungry bird a Feed me button instead of a chip (ac-2)", () => {
    const html = render(data({ birds: mock }));
    expect(html).toContain("Hungry. Has opinions about it.");
    expect(html).toMatch(
      /<button[^>]*aria-label="Feed Admiral Crumbs"[^>]*>Feed me<\/button>/,
    );
    expect(html.match(/<button/g)).toHaveLength(1);
  });

  it("counts perches and draws a dashed slot for each empty one (ac-3)", () => {
    const html = render(data({ birds: mock, perches: 6 }));
    expect(html).toContain("4 of 6 perches");
    expect(html.match(/data-perch="empty"/g)).toHaveLength(2);
    expect(html).not.toContain("An egg is ready");
    expect(html).not.toContain("A roommate is waiting");
  });

  it("says an egg is ready in the first empty slot (ac-3)", () => {
    const html = render(
      data({
        birds: [bird("Gerald"), bird("Brenda")],
        perches: 4,
        egg: { status: "ready", deliveriesToGo: 0 },
      }),
    );
    expect(html).toContain("2 of 4 perches");
    expect(html.match(/data-perch="egg"/g)).toHaveLength(1);
    expect(html.match(/data-perch="empty"/g)).toHaveLength(1);
    expect(html.indexOf('data-perch="egg"')).toBeLessThan(
      html.indexOf('data-perch="empty"'),
    );
    expect(html).toContain("An egg is ready");
  });

  it("says a roommate is waiting in the first empty slot (ac-4)", () => {
    const html = render(data({ birds: [bird("Gerald")], perches: 3 }));
    expect(html.match(/data-perch="roommate"/g)).toHaveLength(1);
    expect(html.match(/data-perch="empty"/g)).toHaveLength(1);
    expect(html.indexOf('data-perch="roommate"')).toBeLessThan(
      html.indexOf('data-perch="empty"'),
    );
    expect(html).toMatch(
      /<a[^>]*href="\/aviary\/roommate"[^>]*>A roommate is waiting<\/a>/,
    );
  });

  it("gives a ready egg the slot after the roommate (ac-4)", () => {
    const html = render(
      data({
        birds: [bird("Gerald")],
        perches: 4,
        egg: { status: "ready", deliveriesToGo: 0 },
      }),
    );
    const order = [...html.matchAll(/data-perch="(\w+)"/g)].map((m) => m[1]);
    expect(order).toEqual(["roommate", "egg", "empty"]);
  });

  it("drops the roommate slot once the roommate is adopted (ac-4)", () => {
    const before = render(data({ birds: [bird("Gerald")], perches: 3 }));
    expect(before).toContain("A roommate is waiting");
    const after = render(
      data({ birds: [bird("Gerald"), bird("Brenda")], perches: 3 }),
    );
    expect(after).not.toContain('data-perch="roommate"');
    expect(after).not.toContain("A roommate is waiting");
    expect(after.match(/data-perch="empty"/g)).toHaveLength(1);
  });

  it("shows an incoming card for each flight headed to me (ac-3)", () => {
    const incoming = (id: string, from: string, name: string) => ({
      id,
      kind: "delivery",
      status: "flying",
      role: "incoming",
      bird: { id: `${id}-bird`, name },
      owner: { id: from.toLowerCase(), name: from },
      to: { label: "Williamsburg" },
      releaseAt: now - 60_000,
      arriveAt: now + 12 * 60_000,
    });
    const html = render(
      data({
        birds: mock,
        flights: [
          incoming("f1", "Priya", "Dumpling"),
          incoming("f2", "Theo", "Pip"),
        ],
      }),
    );
    expect(html).toContain("Incoming from Priya");
    expect(html).toContain("Dumpling lands on your sill this morning");
    expect(html).not.toContain("in 12 min");
    expect(html).toContain("Incoming from Theo");
    expect(html).toContain('href="/flights/f1"');
    expect(html).toContain('href="/flights/f2"');
  });

  it("shows no incoming card when nothing is headed to me", () => {
    expect(render(data({ birds: mock }))).not.toContain("Incoming from");
  });

  it("renders five birds with one row each", () => {
    const five = ["A", "B", "C", "D", "E"].map((n) => bird(`Bird ${n}`));
    const html = render(data({ birds: five, perches: 5 }));
    expect(html.match(/href="\/birds\//g)).toHaveLength(5);
    expect(html).toContain("5 of 5 perches");
    expect(html).not.toContain("data-perch=");
  });
});

describe("Flock rows open the bird's page", () => {
  const html = render(
    data({
      birds: [
        bird("Gerald"),
        bird("Brenda", { look: "brenda", status: "flying" }),
        bird("Admiral Crumbs", { look: "admiral", hungry: true }),
      ],
      perches: 4,
      egg: null,
    }),
  );
  const rows = html.match(/<li[^>]*>.*?<\/li>/g) ?? [];
  const row = (name: string) => rows.find((r) => r.includes(`>${name}<`));

  it.each([
    ["Gerald", "gerald", "Ready"],
    ["Brenda", "brenda", "Flying"],
  ])(
    "labels %s's row to /birds/%s and keeps its %s chip (ac-1)",
    (name, id, chip) => {
      const link = row(name)?.match(/<a[^>]*>/)?.[0];
      expect(link).toContain(`href="/birds/${id}"`);
      expect(link).toContain(`aria-label="Open ${name}"`);
      expect(row(name)).toContain(`>${chip}<`);
    },
  );

  it("gives each row one link, closed before the chip or Feed button (ac-2)", () => {
    for (const name of ["Gerald", "Brenda", "Admiral Crumbs"]) {
      const r = row(name) ?? "";
      expect(r.match(/<a[\s>]/g)).toHaveLength(1);
      expect(r).not.toMatch(/href="\/(flights|jobs)\//);
      const close = r.indexOf("</a>");
      const after = r.slice(close);
      expect(after).toMatch(/<(span class="[^"]*chip|button)/);
    }
    const feed = row("Admiral Crumbs") ?? "";
    expect(feed).toMatch(/<button[^>]*aria-label="Feed Admiral Crumbs"/);
    expect(feed.indexOf("<button")).toBeGreaterThan(feed.indexOf("</a>"));
  });

  it("leaves an empty perch with no link (ac-3)", () => {
    const empty = rows.find((r) => r.includes('aria-label="Empty perch"'));
    expect(empty).toBeDefined();
    expect(empty).not.toContain("<a");
  });

  it("shows a pressed and focused state on a 44 px row (ac-1)", () => {
    const css = readFileSync(
      new URL("./Flock.module.css", import.meta.url),
      "utf8",
    );
    expect(css).toMatch(/\.rowLink:active|:has\(> \.rowLink:active\)/);
    expect(css).toMatch(/\.rowLink:focus-visible::after \{/);
    const minHeight = css.match(/\.row \{[^}]*min-height: (\d+)px/)?.[1];
    expect(Number(minHeight)).toBeGreaterThanOrEqual(44);
  });
});

describe("Flock tiredness from the server projection (ac-2)", () => {
  const record = (energy: number): BirdRecord => ({
    id: "00000000-0000-4000-b000-000000000011",
    ownerId: "00000000-0000-4000-a000-000000000001",
    name: "Gerald",
    breed: "city",
    look: "gerald",
    pronoun: "they",
    speedMph: 40,
    focus: 3,
    navigation: 3,
    quirks: [],
    miles: 0,
    deliveries: 0,
    detours: 0,
    belly: 80,
    feathers: 80,
    energy,
    careAt: now,
    lastFedAt: now,
    hungryNotified: false,
    status: "home",
    busyKind: null,
    busyUntil: null,
    gear: [],
    hatchedAt: now,
  });

  const rowFor = (energy: number) => {
    const view = toBirdView(record(energy), now, { hasBirdbath: false });
    const html = renderToStaticMarkup(
      <Flock
        data={
          {
            serverNow: now,
            me: { timezone: "UTC", perches: 1 },
            birds: [view],
            flights: [],
            myVisiting: [],
            egg: null,
          } as unknown as SyncPayload
        }
        onFeed={() => {}}
      />,
    );
    return {
      canFly: view.canFly,
      line: html.match(/<span class="[^"]*line[^"]*">([^<]+)<\/span>/)?.[1],
      chip: html.includes(">Resting<")
        ? "Resting"
        : html.includes(">Ready<")
          ? "Ready"
          : null,
    };
  };

  it.each([
    [14, false, "Resting", "Too tired to fly. Resting up."],
    [15, true, "Ready", "Home and a bit tired. Can still fly."],
    [30, true, "Ready", "Home and a bit tired. Can still fly."],
    [40, true, "Ready", "Home, fed, smug"],
  ])("energy %d: canFly %s, %s, %s", (energy, canFly, chip, line) => {
    expect(rowFor(energy)).toEqual({ canFly, chip, line });
  });
});
