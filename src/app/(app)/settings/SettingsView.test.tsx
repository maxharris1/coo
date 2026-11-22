import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { config } from "@/lib/config";
import type { Me } from "@/server/rows";
import type { PlaceResult } from "../welcome/loft/roost";
import { SettingsView, type Sheet } from "./SettingsView";

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

const PLACES: PlaceResult[] = [
  {
    placeId: "p-1",
    label: "Back Bay",
    sublabel: "Boston, MA",
    kind: "neighbourhood",
  },
  {
    placeId: "p-2",
    label: "Fishtown",
    sublabel: "Philadelphia, PA",
    kind: "neighbourhood",
  },
];

const render = (me: Me = ME, sheet: Sheet = null, places: PlaceResult[] = []) =>
  renderToStaticMarkup(
    <SettingsView
      me={me}
      sheet={sheet}
      places={places}
      onSearch={() => {}}
      onPlace={() => {}}
      onSave={() => {}}
      onSignOut={() => {}}
      onSheet={() => {}}
      onTravel={() => {}}
      onDelete={() => {}}
    />,
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

describe("SettingsView travel and delete (ac-1, ac-2)", () => {
  const travelling = (on: boolean) => ({
    ...ME,
    loft: { ...ME.loft!, travelling: on },
  });

  it("shows the travel switch under where birds find me, from me.loft.travelling", () => {
    const words = text(render());
    const where = words.indexOf("Where birds find me");
    const away = words.indexOf("I'm away from home");
    expect(where).toBeGreaterThanOrEqual(0);
    expect(away).toBeGreaterThan(where);
    expect(away).toBeLessThan(words.indexOf("App "));
    expect(switchState(render(travelling(false)), "I'm away from home")).toBe(
      "false",
    );
    expect(switchState(render(travelling(true)), "I'm away from home")).toBe(
      "true",
    );
    expect(
      switchState(render({ ...ME, loft: null }), "I'm away from home"),
    ).toBe("false");
  });

  it("shows the travel sheet copy only when the travel sheet is open", () => {
    const closed = render();
    expect(closed).not.toContain('role="dialog"');
    expect(text(closed)).not.toContain(
      "You can switch this once every 12 hours.",
    );
    const html = render(ME, "travel");
    expect(html).toMatch(
      /<div[^>]*role="dialog"[^>]*aria-label="I&#x27;m away from home"/,
    );
    const words = text(html);
    expect(words).toContain("You can switch this once every 12 hours.");
    expect(words).toContain(
      "Your flock comes with you. Birds already flying land where they were sent.",
    );
    expect(html).toMatch(/<button[^>]*>Use my location<\/button>/);
    expect(html).toMatch(/<button[^>]*>Cancel<\/button>/);
    expect(html).not.toContain("Type your handle to delete");
  });

  it("travel offers the docs/07 place search", () => {
    const dialog = render(ME, "travel").split('role="dialog"')[1];
    expect(dialog).toMatch(
      /<input|role="search"|Search|Pick a place|Choose a place/,
    );
  });

  it("travel sheet has a labelled place search beside Use my location", () => {
    const dialog = render(ME, "travel").split('role="dialog"')[1];
    const form = /<form[^>]*role="search"[^>]*>(.*?)<\/form>/.exec(dialog);
    expect(form).not.toBeNull();
    const label = /<label[^>]*for="([^"]+)"[^>]*>Pick a place<\/label>/.exec(
      form![1],
    );
    expect(label).not.toBeNull();
    const input = new RegExp(`<input[^>]*id="${label![1]}"[^>]*>`).exec(
      form![1],
    )?.[0];
    expect(input).toContain('type="search"');
    expect(input).toContain('name="q"');
    expect(dialog).toMatch(/<button[^>]*>Use my location<\/button>/);
  });

  it("travel sheet lists searched places as buttons, and no list without results", () => {
    expect(render(ME, "travel")).not.toContain("<ul");
    const words = text(render(ME, "travel", PLACES));
    expect(words).toContain("Back Bay Boston, MA");
    expect(words).toContain("Fishtown Philadelphia, PA");
    expect(render(ME, null, PLACES)).not.toContain("Back Bay");
  });

  it("offers Delete my account in Account, before Sign out", () => {
    const words = text(render());
    const del = words.indexOf("Delete my account");
    expect(del).toBeGreaterThan(words.indexOf("Account"));
    expect(del).toBeLessThan(words.indexOf("Sign out"));
  });

  it("asks for the handle in a labelled field when the delete sheet is open", () => {
    expect(render()).not.toContain("Type your handle to delete");
    const html = render(ME, "delete");
    expect(html).toMatch(
      /<div[^>]*role="dialog"[^>]*aria-label="Delete my account"/,
    );
    const label =
      /<label[^>]*for="([^"]+)"[^>]*>Type your handle to delete<\/label>/.exec(
        html,
      );
    expect(label).not.toBeNull();
    const input = new RegExp(`<input[^>]*id="${label![1]}"[^>]*>`).exec(
      html,
    )?.[0];
    expect(input).toContain('name="handle"');
    expect(input).toContain('placeholder="max"');
    expect(input).toMatch(/autocomplete="off"/i);
    expect(input).not.toContain("value=");
    expect(html).toMatch(
      /<form[^>]*>.*<button type="submit"[^>]*>Delete my account<\/button>/,
    );
    expect(html).not.toContain("You can switch this once every 12 hours.");
  });
});
