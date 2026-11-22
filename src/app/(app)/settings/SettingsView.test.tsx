import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { config } from "@/lib/config";
import type { Me } from "@/server/rows";
import { SettingsView } from "./SettingsView";

vi.mock("next/link", () => ({
  default: (props: object) => <a {...props} />,
}));

const ME = {
  id: "me-1",
  name: "Max",
  handle: "max",
  phoneLast4: "0142",
  units: "mi",
  installed: true,
  loft: {
    lat: 40.71,
    lon: -73.95,
    label: "Williamsburg",
    city: "Brooklyn",
    travelling: false,
  },
  settings: {
    notifyLandedIn: true,
    notifyLandedOut: true,
    notifyDelays: true,
    notifyHungry: false,
    quietOn: true,
    quietStart: 22,
    quietEnd: 7,
    smsFallback: false,
  },
} as Me;

const render = (me: Me = ME) =>
  renderToStaticMarkup(
    <SettingsView me={me} onSave={() => {}} onSignOut={() => {}} />,
  );

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ");

const switchState = (html: string, label: string) => {
  const at = html.indexOf(`>${label.replace(/'/g, "&#x27;")}<`);
  const open = html.lastIndexOf("<button", at);
  return /aria-checked="(true|false)"/.exec(html.slice(open, at))?.[1];
};

describe("SettingsView (ac-1)", () => {
  it("renders the sections of the Settings mock in order", () => {
    const words = text(render());
    const order = [
      "Settings",
      "Tell me when",
      "Where birds find me",
      "App",
      "Account",
      "Sign out",
    ].map((w) => words.indexOf(w));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("shows each notification switch and the SMS fallback switch from me", () => {
    const html = render();
    expect(switchState(html, "A bird lands on my sill")).toBe("true");
    expect(switchState(html, "My bird lands")).toBe("true");
    expect(switchState(html, "A bird is delayed or roosting")).toBe("true");
    expect(switchState(html, "A bird is hungry")).toBe("false");
    expect(switchState(html, "Text me when a push can't reach me")).toBe(
      "false",
    );
  });

  it("shows quiet hours as a range, or Off", () => {
    expect(text(render())).toContain(
      "Quiet hours Birds still land. Your phone stays quiet. 10 pm to 7 am",
    );
    const noon = { ...ME.settings, quietStart: 0, quietEnd: 12 };
    expect(text(render({ ...ME, settings: noon }))).toContain("12 am to 12 pm");
    const off = { ...ME.settings, quietOn: false };
    expect(text(render({ ...ME, settings: off }))).toContain(
      "Your phone stays quiet. Off",
    );
  });

  it("says friends see per friend, linking to /friends", () => {
    const html = render();
    expect(html).toMatch(
      /<a[^>]*href="\/friends"[^>]*>.*Friends see.*Change it per friend in Friends.*Per friend/,
    );
  });

  it("shows the home roost, distances, home screen and name", () => {
    const words = text(render());
    expect(words).toContain(
      "Home roost Your address is never stored or shown Williamsburg",
    );
    expect(words).toContain("On your home screen Yes");
    expect(words).toContain("Name Max");
    expect(text(render({ ...ME, installed: false }))).toContain(
      "On your home screen No",
    );
    expect(text(render({ ...ME, loft: null }))).toContain("Not set");
  });

  it("offers Miles and Kilometres with the synced one chosen", () => {
    const html = render();
    expect(switchState(html, "Miles")).toBe("true");
    expect(switchState(html, "Kilometres")).toBe("false");
    const km = render({ ...ME, units: "km" });
    expect(switchState(km, "Miles")).toBe("false");
    expect(switchState(km, "Kilometres")).toBe("true");
  });

  it("shows the phone only when its last four digits are known", () => {
    expect(text(render())).toContain("Phone Ends in 0142");
    expect(text(render({ ...ME, phoneLast4: null }))).not.toContain("Phone");
  });

  it("shows the attribution lines and links to privacy and terms", () => {
    const html = render();
    const words = text(html);
    expect(words).toContain(config.app.mapAttribution);
    expect(words).toContain(config.app.weatherAttribution);
    expect(html).toMatch(/<a[^>]*href="\/privacy"[^>]*>Privacy<\/a>/);
    expect(html).toMatch(/<a[^>]*href="\/terms"[^>]*>Terms<\/a>/);
  });

  it("labels the back link and gives every switch a label", () => {
    const html = render();
    expect(html).toMatch(/<a[^>]*aria-label="Back to the post office"/);
    for (const button of html.match(/<button[^>]*role="switch"[^>]*>/g) ?? []) {
      expect(button).toMatch(/aria-checked="(true|false)"/);
    }
  });
});
