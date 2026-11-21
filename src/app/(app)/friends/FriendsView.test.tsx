import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
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
      `href="sms:?&amp;body=${encodeURIComponent("Trade pigeons with me on Coo: https://coo.example/join/max")}"`,
    );
  });

  it("explains City and Block", () => {
    expect(render()).toContain(
      "City shows a friend your city. Block shows the roost nearest you, so short flights can be drawn street by street. Nobody sees an address.",
    );
  });

  it("lists each friend with where they are and the toggle state", () => {
    const html = render();
    expect(html).toContain(">4 friends</h2>");
    expect(html).toContain("They can see");
    expect(html).toContain("Philadelphia, 81 mi");
    expect(html).toContain("Boston, 190 mi");
    expect(html).toContain("3 blocks over");
    expect(html).toContain("Chicago, 713 mi");
    const groups = html.match(/role="group"[\s\S]*?<\/div>/g) ?? [];
    expect(groups).toHaveLength(4);
    const pressed = groups.map(
      (g) => /aria-pressed="true"[^>]*>(City|Block)</.exec(g)?.[1],
    );
    expect(pressed).toEqual(["City", "City", "Block", "City"]);
    expect(html).toContain('aria-label="What Rosa can see"');
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
