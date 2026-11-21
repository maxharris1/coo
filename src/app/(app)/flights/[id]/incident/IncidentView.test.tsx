import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { IncidentReport } from "./incident";
import { IncidentView } from "./IncidentView";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: ComponentProps<"a">) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const REPORT: IncidentReport = {
  reportNo: "0004",
  headline: "Kevin did not arrive",
  sub: "Your note to Theo is running late. We told Theo a bird is on the way, eventually.",
  rows: [
    { label: "Bird", value: "Kevin. 38 mph on a good day." },
    { label: "Route", value: "Brooklyn to Boston, 190 miles" },
    { label: "Last seen", value: "Hartford, 2:14 pm" },
    { label: "Cause", value: "Found a pretzel. Chose the pretzel." },
    { label: "Your note", value: "Still attached. Probably." },
  ],
  place: "Hartford",
  search: { kind: "unavailable" },
  resend: null,
  footer: "Kevin has wandered off 4 times. He has come home by dusk 4 times.",
};

const BIRD = { name: "Kevin", look: "kevin" as const, gear: [] };

const render = (report: IncidentReport = REPORT) =>
  renderToStaticMarkup(<IncidentView report={report} bird={BIRD} />);

const text = (html: string) =>
  html
    .replace(/<svg[\s\S]*?<\/svg>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

describe("IncidentView", () => {
  it("reads as the top of the mock, header to fact list", () => {
    expect(text(render())).toBe(
      [
        "Bureau of Pigeon Affairs",
        "Flight incident report no. 0004",
        "Kevin did not arrive",
        "Your note to Theo is running late. We told Theo a bird is on the way, eventually.",
        "Hartford DELAYED",
        "Bird Kevin. 38 mph on a good day.",
        "Route Brooklyn to Boston, 190 miles",
        "Last seen Hartford, 2:14 pm",
        "Cause Found a pretzel. Chose the pretzel.",
        "Your note Still attached. Probably.",
      ].join(" "),
    );
    expect(render()).toMatch(/<h1[^>]*>Kevin did not arrive<\/h1>/);
  });

  it("goes back to the loft from a labelled link", () => {
    expect(render()).toMatch(/<a href="\/"[^>]*aria-label="Back to the loft"/);
  });

  it("lists the five facts as term and value pairs in data order", () => {
    const pairs = [
      ...render().matchAll(/<dt[^>]*>([^<]*)<\/dt><dd[^>]*>([^<]*)<\/dd>/g),
    ].map((m) => [m[1], m[2]]);
    expect(pairs).toEqual(REPORT.rows.map((r) => [r.label, r.value]));
  });

  it("draws the scene as one labelled image naming the bird and the place", () => {
    const html = render();
    expect(html).toContain(
      'role="img" aria-label="Kevin, standing on a statue in Hartford"',
    );
    for (const art of ["cloud", "statue", "pretzel"]) {
      expect(html).toContain(`/assets/svg/illustrations/${art}.svg`);
    }
    expect(html).toContain("#7A7396");
    expect(html).toContain(">DELAYED<");
  });

  it("leaves out the sign and the place when nobody knows where the bird is", () => {
    const html = render({ ...REPORT, place: null });
    expect(html).toContain('aria-label="Kevin, standing on a statue"');
    expect(text(html)).not.toContain("Hartford DELAYED");
    expect(text(html)).toContain("eventually. DELAYED Bird");
  });
});
