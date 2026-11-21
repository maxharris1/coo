import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import emptyStates from "../../../../assets/copy/empty-states.json";
import type { NotificationItem } from "@/server/services/notifications";
import { NotificationsView, type ScreenState } from "./NotificationsView";

const AT = Date.parse("2026-11-20T19:05:00Z");

const item = (
  id: string,
  kind: string,
  title: string,
  body: string,
): NotificationItem => ({
  id,
  kind,
  title,
  body,
  url: `/sill/${id}`,
  createdAt: AT,
  read: false,
});

const render = (state: ScreenState) =>
  renderToStaticMarkup(<NotificationsView state={state} timezone="UTC" />);

describe("NotificationsView (ac-3)", () => {
  it("shows the loader while loading", () => {
    expect(render({ kind: "loading" })).toContain('aria-busy="true"');
  });

  it("renders one row per notification with its title, body and time, linking to its url", () => {
    const html = render({
      kind: "ready",
      items: [
        item("n1", "landed-in", "Dumpling has landed", "There is a note from Priya on your sill."),
        item("n2", "hungry", "Gerald is hungry", "A snack would help."),
      ],
    });
    expect(html.match(/<li/g)).toHaveLength(2);
    expect(html).toContain("Dumpling has landed");
    expect(html).toContain("There is a note from Priya on your sill.");
    expect(html).toContain("Gerald is hungry");
    expect(html).toContain('href="/sill/n1"');
    expect(html).toContain("7:05 pm");
  });

  it("shows the empty-states line when there are none", () => {
    const line = emptyStates.find((s) => s.state === "No notifications")!.text;
    expect(render({ kind: "ready", items: [] })).toContain(line);
  });

  it("renders no rows when loading failed", () => {
    expect(render({ kind: "failed" })).not.toContain("<li");
  });
});
