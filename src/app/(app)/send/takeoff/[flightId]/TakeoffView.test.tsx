import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TakeoffView } from "./TakeoffView";

vi.mock("next/link", () => ({
  default: ({
    href,
    replace,
    children,
    ...rest
  }: ComponentProps<"a"> & { href: string; replace?: boolean }) => (
    <a href={href} data-replace={replace ? "" : undefined} {...rest}>
      {children}
    </a>
  ),
}));

const props = (animate: boolean): ComponentProps<typeof TakeoffView> => ({
  flightId: "f1",
  bird: { name: "Gerald", look: "gerald", gear: ["goggles", "band"] },
  copy: {
    released: "Released 9:32 am",
    headline: "And he's off",
    note: "Gerald has your note for Priya. He should land this morning.",
  },
  animate,
});

const text = (html: string) =>
  html
    .replace(/<svg[\s\S]*?<\/svg>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replaceAll("&#x27;", "'")
    .replace(/\s+/g, " ")
    .trim();

describe("TakeoffView", () => {
  it("reads as the mock, top to bottom", () => {
    const html = renderToStaticMarkup(<TakeoffView {...props(true)} />);
    expect(text(html)).toBe(
      "Released 9:32 am And he's off Gerald has your note for Priya. He should land this morning. Watch the flight The tracker opens by itself after a second.",
    );
    expect(html).toMatch(/<h1[^>]*>And he&#x27;s off<\/h1>/);
  });

  it("plays the takeoff sequence with dust and a feather, once", () => {
    const html = renderToStaticMarkup(<TakeoffView {...props(true)} />);
    expect(html).toContain("coo-takeoff-crouch-held 2.5s linear 1 forwards");
    expect(html).toContain("coo-takeoff-fly 2.5s linear 1 forwards");
    expect(html.match(/coo-puff [^;"]*/g)).toHaveLength(3);
    expect(html.match(/coo-feather [^;"]*/g)).toHaveLength(2);
    expect(html).not.toMatch(/coo-(puff|feather)[^;"]*infinite/);
    expect(html).toContain('aria-label="Gerald launching off the ledge"');
  });

  it("goes to the tracker at once from the button, replacing itself", () => {
    const html = renderToStaticMarkup(<TakeoffView {...props(true)} />);
    expect(html).toMatch(
      /<a href="\/flights\/f1" data-replace=""[^>]*>Watch the flight<\/a>/,
    );
  });

  it("takes another button label and bird title for a bird going home", () => {
    const html = renderToStaticMarkup(
      <TakeoffView
        {...props(true)}
        watchLabel="Watch her go"
        birdTitle="Dumpling launching off your sill with the reply"
      />,
    );
    expect(html).toMatch(
      /<a href="\/flights\/f1" data-replace=""[^>]*>Watch her go<\/a>/,
    );
    expect(html).toContain(
      'aria-label="Dumpling launching off your sill with the reply"',
    );
    expect(html).not.toContain("Watch the flight");
  });

  it("with reduced motion keeps the button and drops the promise to move on", () => {
    const html = renderToStaticMarkup(<TakeoffView {...props(false)} />);
    expect(text(html)).toBe(
      "Released 9:32 am And he's off Gerald has your note for Priya. He should land this morning. Watch the flight",
    );
  });

  it("with reduced motion shows the final frame, the ledge without the bird", () => {
    const html = renderToStaticMarkup(<TakeoffView {...props(false)} />);
    expect(html).not.toContain("coo-takeoff");
    expect(html).not.toMatch(/coo-(puff|feather)/);
  });

  it("goes wherever it is sent, replacing itself", () => {
    const html = renderToStaticMarkup(
      <TakeoffView {...props(true)} href="/send/share/f1" />,
    );
    expect(html).toMatch(
      /<a href="\/send\/share\/f1" data-replace=""[^>]*>Watch the flight<\/a>/,
    );
    expect(html).not.toContain('href="/flights/f1"');
  });
});
