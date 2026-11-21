import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import PrivacyPage from "../privacy/page";
import TermsPage from "../terms/page";

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
