import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { HatchState } from "./hatch";
import { HatchView } from "./HatchView";
import HatchPage from "./page";
import { SyncContext } from "@/components/SyncProvider";
import { ToastProvider } from "@/components/Toasts";

const css = readFileSync(
  new URL("./Hatch.module.css", import.meta.url),
  "utf8",
);

const render = (state: HatchState) =>
  renderToStaticMarkup(
    <HatchView state={state} dispatch={() => {}} onSubmit={() => {}} />,
  ).replaceAll("&#x27;", "'");

const naming: HatchState = {
  kind: "naming",
  name: "Pretzel",
  pronoun: "she",
  sending: false,
};

describe("/aviary/hatch naming (ac-1)", () => {
  const html = render(naming);

  it("shows a wobbling egg", () => {
    expect(html).toMatch(/class="[^"]*wobble[^"]*"/);
    expect(css).toMatch(/\.wobble\s*{[^}]*animation:[^;]*coo-wobble/);
    expect(css).toMatch(/@keyframes coo-wobble/);
  });

  it("asks for a name and keeps what was typed", () => {
    expect(html).toMatch(/<label[^>]*for="hatch-name"[^>]*>Name your bird/);
    expect(html).toMatch(/<input[^>]*id="hatch-name"[^>]*value="Pretzel"/);
  });

  it("offers the three pronoun chips with the chosen one checked", () => {
    expect(html).toMatch(/<legend[^>]*>Pronoun<\/legend>/);
    const radios = [
      ...html.matchAll(/type="radio"[^>]*name="pronoun"[^>]*value="(\w+)"/g),
    ];
    expect(radios.map((m) => m[1])).toEqual(["he", "she", "they"]);
    expect(html).toMatch(/checked="" value="she"/);
  });

  it("submits with Welcome home", () => {
    expect(html).toMatch(/<button type="submit"[^>]*>Welcome home<\/button>/);
  });

  it("disables Welcome home while sending", () => {
    expect(render({ ...naming, sending: true })).toMatch(
      /<button type="submit"[^>]*disabled=""[^>]*>Welcome home/,
    );
  });

  it("links back to the aviary", () => {
    expect(html).toMatch(/href="\/aviary"/);
  });
});

describe("/aviary/hatch hatched (ac-1)", () => {
  const html = render({
    kind: "hatched",
    bird: {
      id: "b1",
      name: "Pretzel",
      pronoun: "she",
      breed: "fantail",
      look: "gerald",
    },
  });

  it("cracks the egg", () => {
    expect(html).toMatch(/class="[^"]*crackLeft[^"]*"/);
    expect(html).toMatch(/class="[^"]*crackRight[^"]*"/);
    expect(css).toMatch(/\.crackLeft\s*{[^}]*animation:[^;]*coo-crack-left/);
    expect(css).toMatch(/\.crackRight\s*{[^}]*animation:[^;]*coo-crack-right/);
  });

  it("shows the new bird and its breed card", () => {
    expect(html).toContain('role="img" aria-label="Pretzel"');
    expect(html).toContain(">Fantail<");
    expect(html).toContain(">Slow, gorgeous, knows it.<");
    expect(html).toContain(">Friends tip double<");
  });

  it("drops the form", () => {
    expect(html).not.toContain("Welcome home</button>");
    expect(html).toMatch(/href="\/aviary"/);
  });
});

describe("/aviary/hatch motion (ac-1)", () => {
  it("turns every animation off under prefers-reduced-motion", () => {
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\.screen \*,\s*\.screen \*::before,\s*\.screen \*::after \{\s*animation: none !important;/,
    );
  });
});

describe("/aviary/hatch page", () => {
  it("renders the naming form first", () => {
    const html = renderToStaticMarkup(
      <SyncContext.Provider
        value={{ data: null, error: null, offsetMs: 0, refresh: () => {} }}
      >
        <ToastProvider>
          <HatchPage />
        </ToastProvider>
      </SyncContext.Provider>,
    );
    expect(html).toContain("Welcome home");
    expect(html).toMatch(/<input[^>]*id="hatch-name"[^>]*value=""/);
  });
});
