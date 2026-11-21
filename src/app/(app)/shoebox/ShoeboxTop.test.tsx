import { readFileSync } from "node:fs";
import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { FriendRow } from "@/server/services/friends";
import { ShoeboxTop } from "./ShoeboxTop";

type Friend = Pick<FriendRow, "id" | "name">;

const friend = (name: string): Friend => ({
  id: `id-${name.toLowerCase()}` as Friend["id"],
  name,
});

const friends = [friend("Priya"), friend("Theo"), friend("Rosa")];

const render = (
  props: Partial<Parameters<typeof ShoeboxTop>[0]> = {},
): string =>
  renderToStaticMarkup(
    <ShoeboxTop
      total={23}
      friends={friends}
      selected={null}
      onSelect={() => {}}
      {...props}
    />,
  );

const buttons = (html: string) =>
  [...html.matchAll(/<button[^>]*>.*?<\/button>/gs)].map((m) => m[0]);

const label = (button: string) => button.replace(/<[^>]*>/g, "");

const css = readFileSync(
  new URL("./ShoeboxTop.module.css", import.meta.url),
  "utf8",
);

const rule = (selector: string) =>
  css.match(new RegExp(`\\${selector} \\{[^}]*\\}`))?.[0] ?? "";

function clickables(node: ReactNode): ReactElement<{
  children?: ReactNode;
  onClick?: () => void;
}>[] {
  if (!isValidElement<{ children?: ReactNode; onClick?: () => void }>(node))
    return [];
  const own = node.props.onClick ? [node] : [];
  return [...own, ...Children.toArray(node.props.children).flatMap(clickables)];
}

describe("ShoeboxTop (ac-1)", () => {
  const html = render();

  it("links back to More with a label", () => {
    const back = html.match(/<a[^>]*>/)?.[0];
    expect(back).toContain('href="/more"');
    expect(back).toContain('aria-label="Back to the post office"');
  });

  it("titles the screen Shoebox", () => {
    expect(html).toMatch(/<h1[^>]*>Shoebox<\/h1>/);
  });

  it("counts the notes in a pill", () => {
    expect(html).toContain(">23 notes<");
    expect(render({ total: 1 })).toContain(">1 note<");
    expect(render({ total: 0 })).toContain(">0 notes<");
  });

  it("shows Everyone then one chip per friend, in order", () => {
    expect(buttons(html).map(label)).toEqual([
      "Everyone",
      "Priya",
      "Theo",
      "Rosa",
    ]);
  });

  it("presses only Everyone when no friend is selected", () => {
    expect(buttons(html).map((b) => b.includes('aria-pressed="true"'))).toEqual(
      [true, false, false, false],
    );
  });

  it("presses only the selected friend's chip", () => {
    const theo = buttons(render({ selected: friends[1].id }));
    expect(theo.map((b) => b.includes('aria-pressed="true"'))).toEqual([
      false,
      false,
      true,
      false,
    ]);
    expect(theo.every((b) => b.includes('type="button"'))).toBe(true);
  });

  it("selects a friend, or everyone, on tap", () => {
    const onSelect = vi.fn();
    const chips = clickables(
      ShoeboxTop({
        total: 23,
        friends,
        selected: friends[0].id,
        onSelect,
      }),
    );
    expect(chips).toHaveLength(4);
    chips[3].props.onClick?.();
    expect(onSelect).toHaveBeenLastCalledWith(friends[2].id);
    chips[0].props.onClick?.();
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it("fills the pressed chip sun yellow", () => {
    expect(css).toMatch(
      /\.chip\[aria-pressed="true"\] \{[^}]*background: var\(--coo-sun\)/,
    );
    expect(rule(".chip")).toContain("background: var(--coo-card)");
  });

  it("keeps every tap target at least 44 px", () => {
    expect(rule(".back")).toMatch(/width: var\(--coo-touch\)/);
    expect(rule(".back")).toMatch(/height: var\(--coo-touch\)/);
    expect(rule(".chip")).toMatch(/min-height: var\(--coo-touch\)/);
    expect(rule(".chip")).toMatch(/min-width: var\(--coo-touch\)/);
    expect(rule(".chip")).toMatch(/flex-shrink: 0/);
  });

  it("scrolls the chip row sideways instead of clipping or wrapping", () => {
    expect(rule(".chips")).toMatch(/overflow-x: auto/);
    expect(rule(".chips")).not.toMatch(/flex-wrap: wrap/);
    expect(rule(".chip")).toMatch(/white-space: nowrap/);
  });

  it("uses only tokens for colour in its stylesheet", () => {
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});
