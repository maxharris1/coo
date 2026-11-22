import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import PrivacyPage from "../privacy/page";
import TermsPage from "../terms/page";
import { contactLine } from "./LegalPage";

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replaceAll("&#x27;", "'")
    .replaceAll("&amp;", "&")
    .replace(/\s+/g, " ");

const privacyHtml = renderToStaticMarkup(<PrivacyPage />);
const termsHtml = renderToStaticMarkup(<TermsPage />);
const privacy = text(privacyHtml);
const terms = text(termsHtml);
const banner =
  /<aside[^>]*role="note"[^>]*>[^]*?Draft[^]*?approve[^]*?<\/aside>/i;

describe("/privacy", () => {
  it("opens with a visible draft banner waiting for a person to approve it", () => {
    expect(privacyHtml).toMatch(banner);
    expect(privacyHtml.indexOf("<aside")).toBeLessThan(
      privacyHtml.indexOf("<h2"),
    );
  });

  it("has a section for each docs/12 topic", () => {
    const headings = [...privacyHtml.matchAll(/<h2[^>]*>([^<]+)<\/h2>/g)].map(
      (m) => m[1],
    );
    expect(headings).toEqual([
      "What we keep",
      "What we never keep",
      "Who handles it",
      "How to delete it",
    ]);
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

  it("keeps roosts snapped and only a hand-placed guest pin exact", () => {
    expect(privacy).toContain(
      "We snap the spot where birds find you to a coarse grid",
    );
    expect(privacy).toContain(
      "A position from your phone or a search is snapped to the roost grid before it is saved or logged.",
    );
    expect(privacy).toContain(
      "If you send a bird by guest link and place the pin on the map by hand, we keep that pin exactly. Only you and the person holding the link see it.",
    );
  });

  it("names every processor from docs/12", () => {
    for (const processor of [
      "Supabase",
      "Vercel",
      "Twilio",
      "OpenFreeMap",
      "Photon",
      "Open-Meteo",
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
  it("opens with a visible draft banner waiting for a person to approve it", () => {
    expect(termsHtml).toMatch(banner);
    expect(termsHtml.indexOf("<aside")).toBeLessThan(termsHtml.indexOf("<h2"));
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
