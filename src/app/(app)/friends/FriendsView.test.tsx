import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import type { FriendRow } from "@/server/services/friends";
import { FriendsView, type FriendsViewProps } from "./FriendsView";

const row = (
  id: string,
  name: string,
  shows: "city" | "block",
  where: string,
  distanceMi: number,
) =>
  ({
    id,
    name,
    handle: name.toLowerCase(),
    shows,
    theyShow: "city",
    where,
    distanceMi,
  }) as FriendRow;

const FRIENDS = [
  row("p", "Priya", "city", "Philadelphia", 81),
  row("t", "Theo", "city", "Boston", 190),
  row("r", "Rosa", "block", "Fishtown", 0.15),
  row("d", "Dev", "city", "Chicago", 713),
];

const render = (over: Partial<FriendsViewProps> = {}) =>
  renderToStaticMarkup(
    <FriendsView
      inviteLink="https://coo.example/join/max"
      units="mi"
      list={{
        kind: "ready",
        friends: FRIENDS,
        guestLinks: [{ id: "g", name: "Maya", where: "Fishtown" }],
      }}
      onCopy={() => {}}
      sheet={null}
      onOpen={() => {}}
      onStep={() => {}}
      onClose={() => {}}
      onConfirm={() => {}}
      onShows={() => {}}
      {...over}
    />,
  );

describe("Friends screen (ac-1)", () => {
  it("has the header with a labelled back link to the post office", () => {
    const html = render();
    expect(html).toContain('href="/more"');
    expect(html).toContain('aria-label="Back to the post office"');
    expect(html).toContain(">Friends</h1>");
  });

  it("shows the invite card with Copy and Text it", () => {
    const html = render();
    expect(html).toContain("Your invite link");
    expect(html).toContain(">coo.example/join/max</p>");
    expect(html).toContain("<span>Copy</span>");
    expect(html).toContain("<span>Text it</span>");
    expect(html).toContain(
      `href="sms:?&amp;body=${encodeURIComponent(`Trade pigeons with me on ${config.app.name}: https://coo.example/join/max`)}"`,
    );
  });

  it("explains City and Block", () => {
    expect(render()).toContain(
      "City shows a friend your city. Block shows the roost nearest you, so short flights can be drawn street by street. Nobody sees an address.",
    );
  });

  it("lists each friend with where they are", () => {
    const html = render();
    expect(html).toContain(">4 friends</h2>");
    expect(html).toContain("They can see");
    expect(html).toContain("Philadelphia, 81 mi");
    expect(html).toContain("Boston, 190 mi");
    expect(html).toContain("3 blocks over");
    expect(html).toContain("Chicago, 713 mi");
  });

  it("gives each friend a City/Block choice marked with the confirmed value", () => {
    const rows = render().match(/<li[\s\S]*?<\/li>/g) ?? [];
    expect(rows).toHaveLength(4);
    const groups = rows.map(
      (r) => /role="radiogroup"[^>]*aria-label="([^"]*)"/.exec(r)?.[1],
    );
    expect(groups).toEqual([
      "What Priya can see",
      "What Theo can see",
      "What Rosa can see",
      "What Dev can see",
    ]);
    const checked = rows.map((r) =>
      [
        ...r.matchAll(
          /<button[^>]*role="radio"[^>]*aria-checked="(true|false)"[^>]*>(City|Block)</g,
        ),
      ].map(([, on, label]) => `${label}:${on}`),
    );
    expect(checked).toEqual([
      ["City:true", "Block:false"],
      ["City:true", "Block:false"],
      ["City:false", "Block:true"],
      ["City:true", "Block:false"],
    ]);
  });

  it("keeps the choice outside the button that opens the sheet", () => {
    const rows = render().match(/<li[\s\S]*?<\/li>/g) ?? [];
    for (const r of rows) {
      const opener =
        /<button[^>]*aria-haspopup="dialog"[^>]*>[\s\S]*?<\/button>/.exec(
          r,
        )?.[0];
      expect(opener).toBeDefined();
      expect(opener).not.toContain('role="radio"');
    }
  });

  it("says 1 friend in the singular", () => {
    expect(
      render({
        list: { kind: "ready", friends: [FRIENDS[0]], guestLinks: [] },
      }),
    ).toContain(">1 friend</h2>");
  });

  it("renders nothing for waiting guest links yet", () => {
    expect(render()).not.toContain("Maya");
    expect(render()).not.toContain("Waiting on a link");
  });

  it("shows the loader while the list loads and no list after a failure", () => {
    expect(render({ list: { kind: "loading" } })).toContain('aria-busy="true"');
    const failed = render({ list: { kind: "failed" } });
    expect(failed).toContain("Your invite link");
    expect(failed).not.toContain("They can see");
  });
});

describe("friend row sheet (ac-1)", () => {
  it("makes each friend row a button that opens a sheet", () => {
    const rows = render().match(/<li[\s\S]*?<\/li>/g) ?? [];
    for (const r of rows) {
      expect(r).toMatch(/<button[^>]*type="button"[^>]*aria-haspopup="dialog"/);
    }
    expect(render()).not.toContain('role="dialog"');
  });

  it("draws the sheet for the open friend", () => {
    const html = render({
      sheet: { friend: FRIENDS[0], step: "menu", busy: false },
    });
    expect(html).toContain('role="dialog"');
    expect(html).toContain("Priya");
    expect(html).toContain("Unfriend");
  });
});
