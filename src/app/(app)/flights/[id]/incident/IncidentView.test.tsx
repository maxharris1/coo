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

const AVAILABLE = {
  kind: "available",
  cost: 20,
  line: "20 seeds. 7 in 10 strays are back within the hour.",
} as const;

const MOCK: IncidentReport = {
  ...REPORT,
  search: AVAILABLE,
  resend: { href: "/send/write?to=theo", label: "Resend with Gerald" },
};

const render = (
  report: IncidentReport = REPORT,
  { searching = false, onSearch = () => {} } = {},
) =>
  renderToStaticMarkup(
    <IncidentView
      flightId="f-42"
      report={report}
      bird={BIRD}
      searching={searching}
      onSearch={onSearch}
    />,
  );

const element = (
  report: IncidentReport,
  { searching = false, onSearch = () => {} } = {},
) =>
  IncidentView({
    flightId: "f-42",
    report,
    bird: BIRD,
    searching,
    onSearch,
  });

type Node = { type?: unknown; props?: Record<string, unknown> };

function findButton(node: unknown): Node | undefined {
  if (!node || typeof node !== "object") return undefined;
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findButton(child);
      if (hit) return hit;
    }
    return undefined;
  }
  const { type, props } = node as Node;
  if (type === "button") return node as Node;
  return findButton(props?.children);
}

const button = (html: string) => html.match(/<button[^>]*>[\s\S]*?<\/button>/)?.[0];

const text = (html: string) =>
  html
    .replace(/<svg[\s\S]*?<\/svg>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

describe("IncidentView", () => {
  it("reads as the mock, header to footer", () => {
    expect(text(render(MOCK))).toBe(
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
        "Send a search party",
        "20 seeds. 7 in 10 strays are back within the hour.",
        "Wait it out",
        "Resend with Gerald",
        "Kevin has wandered off 4 times. He has come home by dusk 4 times.",
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

  it("offers the search party with its cost and sends it on press", () => {
    const onSearch = vi.fn();
    const html = button(render(MOCK))!;
    expect(html).toMatch(/^<button type="button"/);
    expect(html).not.toContain("disabled");
    expect(html).not.toContain("aria-busy");
    expect(text(html)).toBe(
      "Send a search party 20 seeds. 7 in 10 strays are back within the hour.",
    );
    const press = findButton(element(MOCK, { onSearch }))!.props!
      .onClick as () => void;
    press();
    expect(onSearch).toHaveBeenCalledOnce();
  });

  it("holds the button busy and disabled while the search party is out", () => {
    const html = button(render(MOCK, { searching: true }))!;
    expect(html).toContain('disabled=""');
    expect(html).toContain('aria-busy="true"');
  });

  it("shows the search result on a disabled button once it is done", () => {
    const html = button(
      render({
        ...MOCK,
        search: { kind: "done", line: "Found him. Back in the air." },
      }),
    )!;
    expect(html).toContain('disabled=""');
    expect(text(html)).toBe("Send a search party Found him. Back in the air.");
  });

  it("hides the search party when it cannot be sent", () => {
    expect(render({ ...MOCK, search: { kind: "unavailable" } })).not.toContain(
      "<button",
    );
  });

  it("waits it out on the tracker and resends from the report's link", () => {
    const html = render(MOCK);
    expect(html).toMatch(/<a href="\/flights\/f-42"[^>]*>Wait it out<\/a>/);
    expect(html).toMatch(
      /<a href="\/send\/write\?to=theo"[^>]*>Resend with Gerald<\/a>/,
    );
  });

  it("drops the resend link when no other bird can fly", () => {
    const html = render({ ...MOCK, resend: null });
    expect(html).not.toContain("Resend");
    expect(html).toMatch(/<a href="\/flights\/f-42"[^>]*>Wait it out<\/a>/);
  });

  it("ends on the footer line", () => {
    expect(render(MOCK)).toMatch(
      /<p[^>]*>Kevin has wandered off 4 times\. He has come home by dusk 4 times\.<\/p><\/div><\/div>$/,
    );
  });
});
