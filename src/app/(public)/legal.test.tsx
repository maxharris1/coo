import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import PrivacyPage from "../privacy/page";
import TermsPage from "../terms/page";
import { fill } from "@/lib/format";
import { contactLine } from "./LegalPage";

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replaceAll("&#x27;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&")
    .replace(/\s+/g, " ");

const privacyHtml = renderToStaticMarkup(<PrivacyPage />);
const termsHtml = renderToStaticMarkup(<TermsPage />);
const privacy = text(privacyHtml);
const terms = text(termsHtml);
const headings = (html: string) =>
  [...html.matchAll(/<h2[^>]*>([^<]+)<\/h2>/g)].map((m) => m[1]);

describe.each([
  ["/privacy", privacyHtml],
  ["/terms", termsHtml],
])("%s is final", (_, html) => {
  it("has no draft banner and no draft or approve text", () => {
    expect(html).not.toContain('role="note"');
    expect(html).not.toContain("<aside");
    expect(text(html)).not.toMatch(/draft|approve/i);
  });

  it("shows the effective date right under the title", () => {
    expect(html).toMatch(/<\/h1><p[^>]*>Effective 2026-11-22<\/p>/);
  });
});

it("legal copy has no draft key", () => {
  expect("draft" in config.copy.legal).toBe(false);
});

describe("/privacy", () => {
  it("has a section for each docs/12 topic", () => {
    expect(headings(privacyHtml)).toEqual([
      "What we keep",
      "What we never keep",
      "Who handles it",
      "Text messages",
      "Children",
      "How to delete it",
      "Your rights and changes",
    ]);
  });

  it.each([
    "phone number",
    "about 200 metres",
    "Where you send birds",
    "doodles",
    "not end-to-end encrypted",
    "push",
    "guest's phone number",
    "IP address",
    "exact location",
    "address",
    "contacts",
    "no ads, no analytics",
    "do not sell",
    "Apple, Google or Mozilla",
    "Reply STOP",
    "under 13",
    "Delete my account",
  ])("states %s", (phrase) => {
    expect(privacy).toContain(phrase);
  });

  it("names what is kept", () => {
    for (const kept of ["phone number", "roost", "notes", "push"]) {
      expect(privacy.toLowerCase()).toContain(kept);
    }
    expect(privacy).toContain("not end-to-end encrypted");
  });

  it("names what is never kept", () => {
    for (const notKept of ["exact location", "address", "contacts"]) {
      expect(privacy.toLowerCase()).toContain(notKept);
    }
  });

  it("names every processor from docs/12", () => {
    for (const processor of [
      "Supabase",
      "Vercel",
      "Twilio",
      "OpenFreeMap",
      "Photon",
      "Open-Meteo",
      "Apple, Google or Mozilla",
    ]) {
      expect(privacy).toContain(processor);
    }
  });

  it("says how to delete the account", () => {
    expect(privacy).toContain("Delete my account");
    expect(privacy).toContain("Settings");
  });
});

describe("/terms", () => {
  it("has a section for each topic", () => {
    expect(headings(termsHtml)).toEqual([
      "Who can use it",
      "Be kind",
      "Your notes",
      "Text messages",
      "Birds are slow",
      "No warranty",
      "Limit of liability",
      "Changes and ending",
      "The law",
    ]);
  });

  it.each([
    "at least 13",
    "Guest links are for",
    "Message and data rates may apply",
    "Reply STOP",
    "HELP",
    '"as is"',
    "Our total liability",
    "State of New York",
  ])("states %s", (phrase) => {
    expect(terms).toContain(phrase);
  });

  it("states the age limit and points at the privacy page", () => {
    expect(terms).toContain("13");
    expect(termsHtml).toMatch(/<a[^>]*href="\/privacy"/);
  });
});

describe("contact line", () => {
  it("points at GitHub issues while the support email is a placeholder", () => {
    expect(contactLine("hello@coo.example")).toBe(
      config.copy.legal.contact.withoutEmail,
    );
    expect(contactLine("hello@coo.example")).toContain(
      "open an issue at github.com/maxharris1/coo",
    );
  });

  it("names the support email once it is a real address", () => {
    expect(contactLine("hi@real.org")).toBe(
      "Questions, privacy requests or help: hi@real.org.",
    );
  });

  it.each([
    ["/privacy", privacyHtml],
    ["/terms", termsHtml],
  ])("%s ends with the contact line and never shows .example", (_, html) => {
    const lastParagraph = [...html.matchAll(/<p[^>]*>([^<]*)<\/p>/g)].at(-1);
    expect(lastParagraph?.[1]).toBe(contactLine(config.app.supportEmail));
    expect(html).not.toContain(".example");
    expect(html).not.toContain("{contact}");
  });
});

describe("consent copy", () => {
  const { consent } = config.copy.legal;

  it("sign-in line asks for age, both documents and text consent", () => {
    for (const part of [
      "13 or older",
      "{terms}",
      "{privacy}",
      "Msg and data rates may apply.",
    ]) {
      expect(consent.signIn).toContain(part);
    }
  });

  it("guest label names the bird and says how to stop texts", () => {
    expect(fill(consent.guest, { bird: "Pip" })).toBe(
      "Send me one text when Pip lands. Msg and data rates may apply. Reply STOP to end.",
    );
  });
});
