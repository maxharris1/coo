import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { FriendRow } from "@/server/services/friends";
import { FriendSheet, type SheetStep } from "./FriendSheet";

const PRIYA = {
  id: "p1",
  name: "Priya",
  handle: "priya",
  shows: "city",
  theyShow: "city",
  where: "Philadelphia",
  distanceMi: 81,
} as FriendRow;

const renderFor = (friend: FriendRow, step: SheetStep = "menu", busy = false) =>
  renderToStaticMarkup(
    <FriendSheet
      friend={friend}
      step={step}
      busy={busy}
      onStep={() => {}}
      onClose={() => {}}
      onConfirm={() => {}}
    />,
  );

const render = (step: SheetStep, busy = false) => renderFor(PRIYA, step, busy);

const hrefOf = (html: string, label: string) => {
  const href = new RegExp(`<a[^>]*href="([^"]*)"[^>]*>${label}</a>`).exec(
    html,
  )?.[1];
  expect(href, label).toBeTruthy();
  return new URL(href!.replaceAll("&amp;", "&"), "https://coo.test");
};

const APP_DIR = join(process.cwd(), "src", "app");

const appRoutes = readdirSync(APP_DIR, { recursive: true, encoding: "utf8" })
  .filter((f) => /(^|[\\/])page\.tsx$/.test(f))
  .map((f) => {
    const segments = relative(APP_DIR, join(APP_DIR, f))
      .split(sep)
      .slice(0, -1)
      .filter((s) => !/^\(.*\)$/.test(s))
      .map((s) => (/^\[.*\]$/.test(s) ? "[^/]+" : s));
    return new RegExp(`^/${segments.join("/")}$`);
  });

const STEPS: SheetStep[] = ["menu", "unfriend", "block", "report"];

describe("FriendSheet (ac-1)", () => {
  it("is a labelled modal dialog named for the friend", () => {
    const html = render("menu");
    expect(html).toMatch(/role="dialog"/);
    expect(html).toMatch(/aria-modal="true"/);
    const labelledBy = /aria-labelledby="([^"]+)"/.exec(html)?.[1];
    expect(labelledBy).toBeTruthy();
    expect(html).toMatch(new RegExp(`id="${labelledBy}"[^>]*>Priya<`));
  });

  it("offers Send a bird, Shoebox with them, Unfriend, Block and Report in the drawn order", () => {
    const html = render("menu");
    const labels = [
      "Send a bird",
      "Shoebox with them",
      "Unfriend",
      "Block",
      "Report",
    ];
    const at = labels.map((l) => html.indexOf(`>${l}<`));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("opens Compose with the friend preselected from Send a bird", () => {
    const url = hrefOf(render("menu"), "Send a bird");
    expect(url.pathname).toBe("/send/write");
    expect(url.searchParams.getAll("to")).toEqual(["p1"]);
  });

  it("opens the Shoebox filtered to the friend from Shoebox with them", () => {
    const url = hrefOf(render("menu"), "Shoebox with them");
    expect(url.pathname).toBe("/shoebox");
    expect(url.searchParams.get("friend")).toBe("p1");
  });

  it("encodes an id that needs escaping in both links", () => {
    const html = renderFor({ ...PRIYA, id: "a b&c" } as FriendRow);
    expect(hrefOf(html, "Send a bird").searchParams.get("to")).toBe("a b&c");
    expect(hrefOf(html, "Shoebox with them").searchParams.get("friend")).toBe(
      "a b&c",
    );
  });

  it.each(STEPS)("links only to app routes that exist (%s)", (step) => {
    const hrefs = [...render(step).matchAll(/href="([^"]*)"/g)].map(
      (m) =>
        new URL(m[1].replaceAll("&amp;", "&"), "https://coo.test").pathname,
    );
    for (const path of hrefs) {
      expect(
        appRoutes.some((r) => r.test(path)),
        path,
      ).toBe(true);
    }
  });

  it("asks before unfriending", () => {
    const html = render("unfriend");
    expect(html).toContain("Unfriend Priya?");
    expect(html).toMatch(/<button[^>]*>Unfriend<\/button>/);
    expect(html).toMatch(/<button[^>]*>Cancel<\/button>/);
    expect(html).not.toContain("Send a bird");
  });

  it("asks before blocking", () => {
    const html = render("block");
    expect(html).toContain("Block Priya?");
    expect(html).toMatch(/<button[^>]*>Block<\/button>/);
  });

  it("asks for a reason before reporting and keeps Send disabled while empty", () => {
    const html = render("report");
    expect(html).toContain("Report Priya");
    expect(html).toMatch(/<textarea[^>]*maxLength="500"/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Send report<\/button>/);
  });

  it("disables the confirm button while the request runs", () => {
    expect(render("block", true)).toMatch(
      /<button[^>]*disabled=""[^>]*>Block<\/button>/,
    );
  });
});
