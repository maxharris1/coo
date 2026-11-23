import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { COPY, ERRORS } from "./copy";
import { ReportBugView, type ReportBugStatus } from "./ReportBugView";
import type { SendFailure } from "./submit";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: ComponentProps<"a">) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const EDITING: ReportBugStatus = { kind: "editing", error: null };

const render = (
  text = "",
  status: ReportBugStatus = EDITING,
  route = "/flights",
) =>
  renderToStaticMarkup(
    <ReportBugView
      text={text}
      route={route}
      status={status}
      onText={() => {}}
      onSend={() => {}}
    />,
  );

const escape = (s: string) => renderToStaticMarkup(<>{s}</>);

const button = (html: string) => html.match(/<button[^>]*>[^<]*<\/button>/)![0];

const FAILURES: SendFailure[] = [
  "rate_limited",
  "invalid",
  "offline",
  "unknown",
];

describe("ReportBugView copy", () => {
  it("uses the ticket's strings", () => {
    expect(COPY).toMatchObject({
      back: "Back to the post office",
      heading: "Report a bug",
      lead: "Something's off? Tell us what happened.",
      label: "What happened, and what did you expect?",
      placeholder: "I tapped Send and the bird stayed home.",
      privacy: "Please don't put passwords, addresses or note text in here.",
      send: "Send the report",
      sending: "Sending",
      sentHeading: "Report sent.",
      sentThanks: "A pigeon has it. Thank you for the details.",
    });
    expect(COPY.include("/flights")).toBe(
      "We'll include: the page you came from (/flights), your app version, your device and screen size, and your time zone.",
    );
    expect(COPY.count(1850)).toBe("1850 of 2000");
  });
});

describe("ReportBugView editing", () => {
  it("shows the back link, heading, lead, labelled textarea, both small lines and the button", () => {
    const html = render("", EDITING, "/flights");
    expect(html).toContain(`href="/more"`);
    expect(html).toContain(`aria-label="${escape(COPY.back)}"`);
    expect(html).toMatch(new RegExp(`<h1[^>]*>${escape(COPY.heading)}</h1>`));
    expect(html).toContain(escape(COPY.lead));
    const id = html.match(/<textarea[^>]*\bid="([^"]+)"/)![1];
    expect(html).toContain(`<label for="${id}"`);
    expect(html).toContain(`${escape(COPY.label)}</label>`);
    expect(html).toContain(`placeholder="${escape(COPY.placeholder)}"`);
    expect(html).toContain(`maxLength="2000"`);
    expect(html).toContain(`rows="5"`);
    expect(html).toContain(escape(COPY.include("/flights")));
    expect(html).toContain(escape(COPY.privacy));
    expect(button(html)).toContain(`>${COPY.send}</button>`);
    expect(html).not.toContain('role="alert"');
  });

  it("shows the route it is given in the include line", () => {
    expect(render("", EDITING, "/more")).toContain(
      escape(COPY.include("/more")),
    );
  });

  it.each(["", "   \n"])("disables the button for %j", (text) => {
    expect(button(render(text))).toContain("disabled");
  });

  it("enables the button once there is text", () => {
    expect(button(render(" a "))).not.toContain("disabled");
  });

  it("shows the count only from 1800 characters", () => {
    expect(render("x".repeat(1799))).not.toContain(" of 2000");
    expect(render("x".repeat(1800))).toContain(COPY.count(1800));
    expect(render("x".repeat(1850))).toContain(COPY.count(1850));
  });

  it("keeps the typed text in the textarea", () => {
    expect(render("The bird stayed home")).toMatch(
      /<textarea[^>]*>The bird stayed home<\/textarea>/,
    );
  });
});

describe("ReportBugView sending", () => {
  it("says Sending on a disabled button and keeps the text", () => {
    const html = render("hello", { kind: "sending" });
    expect(button(html)).toContain(`>${COPY.sending}</button>`);
    expect(button(html)).toContain("disabled");
    expect(html).toMatch(/<textarea[^>]*>hello<\/textarea>/);
  });
});

describe("ReportBugView errors", () => {
  it.each(FAILURES)(
    "shows the %s line in an alert above the button",
    (reason) => {
      const html = render("still here", { kind: "editing", error: reason });
      const alert = html.match(/<[^>]*role="alert"[^>]*>([^<]*)</);
      expect(alert?.[1]).toBe(escape(ERRORS[reason]));
      expect(html.indexOf('role="alert"')).toBeLessThan(
        html.indexOf("<button"),
      );
      expect(html).toMatch(/<textarea[^>]*>still here<\/textarea>/);
      expect(button(html)).not.toContain("disabled");
    },
  );
});

describe("ReportBugView sent", () => {
  it("replaces the form with the confirmation and a link back to /more", () => {
    const html = render("hello", { kind: "sent" });
    expect(html).toContain(escape(COPY.sentHeading));
    expect(html).toContain(escape(COPY.sentThanks));
    expect(html).toMatch(
      new RegExp(`<a href="/more"[^>]*>${escape(COPY.back)}</a>`),
    );
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain("<form");
    expect(html).not.toContain(escape(COPY.send));
  });
});

describe("ReportBugView stays inside Coo", () => {
  const STATES: [string, string, ReportBugStatus][] = [
    ["editing empty", "", EDITING],
    ["editing long", "x".repeat(1900), EDITING],
    ...FAILURES.map((error): [string, string, ReportBugStatus] => [
      `error ${error}`,
      "text",
      { kind: "editing", error },
    ]),
    ["sending", "text", { kind: "sending" }],
    ["sent", "text", { kind: "sent" }],
  ];

  it.each(STATES)("has no external link in the %s state", (_, text, status) => {
    const html = render(text, status);
    expect(html).not.toMatch(/mailto:/i);
    expect(html).not.toMatch(/href="\s*http/i);
    expect(html).not.toMatch(/target="_blank"/i);
    expect(html).not.toMatch(/sms:/i);
    expect(html).not.toMatch(/tel:/i);
  });
});
