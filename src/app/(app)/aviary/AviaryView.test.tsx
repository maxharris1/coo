import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SyncContext } from "@/components/SyncProvider";
import { ToastProvider } from "@/components/Toasts";
import type { BreedCard, EggCard } from "./aviary";
import AviaryPage from "./page";
import { AviaryView } from "./AviaryView";

const css = readFileSync(
  new URL("./Aviary.module.css", import.meta.url),
  "utf8",
);

const ready = (egg: EggCard | null, breeds: BreedCard[] = []) =>
  renderToStaticMarkup(
    <AviaryView
      state={{
        kind: "ready",
        top: { perches: "4 of 5 perches", egg, breeds },
      }}
      onRetry={() => {}}
    />,
  );

const BREEDS: BreedCard[] = [
  {
    id: "fantail",
    name: "Fantail",
    note: "Slow, gorgeous, knows it.",
    trait: "Friends tip double",
    owned: false,
  },
  {
    id: "pouter",
    name: "Pouter",
    note: "Mostly air.",
    trait: "Carries two notes",
    owned: true,
  },
  {
    id: "tumbler",
    name: "Tumbler",
    note: "Does a backflip on arrival.",
    trait: "Lands with style",
    owned: false,
  },
];

describe("/aviary header (ac-2)", () => {
  const html = ready(null);

  it("links back to the post office", () => {
    expect(html).toMatch(
      /<a[^>]*href="\/more"[^>]*aria-label="Back to the post office"|<a[^>]*aria-label="Back to the post office"[^>]*href="\/more"/,
    );
  });

  it("titles the page Aviary", () => {
    expect(html).toMatch(/<h1[^>]*>Aviary<\/h1>/);
  });

  it("shows the perch count pill", () => {
    expect(html).toMatch(/>4 of 5 perches<\/div>/);
  });

  it("keeps the back link a 44 px tap target", () => {
    expect(css).toMatch(/\.back\s*{[^}]*width:\s*var\(--coo-touch\)/);
    expect(css).toMatch(/\.back\s*{[^}]*height:\s*var\(--coo-touch\)/);
  });

  it("lets the title shrink and keeps the pill on one line at 360 px", () => {
    expect(css).toMatch(/\.title\s*{[^}]*min-width:\s*0/);
    expect(css).toMatch(/\.pill\s*{[^}]*flex-shrink:\s*0/);
    expect(css).toMatch(/\.pill\s*{[^}]*white-space:\s*nowrap/);
  });
});

describe("/aviary egg card (ac-2)", () => {
  it("shows an incubating egg with deliveries to go and a progress bar", () => {
    const html = ready({ kind: "incubating", toGo: 6, done: 19, span: 25 });
    expect(html).toContain("An egg is on the way");
    expect(html).toContain(
      "It hatches after 6 more deliveries. The breed is a surprise.",
    );
    expect(html).toMatch(/role="img"[^>]*aria-label="19 of 25 deliveries"/);
    expect(html).toContain("width:76%");
    expect(html).not.toContain(">Hatch<");
  });

  it("says one delivery in the singular", () => {
    const html = ready({ kind: "incubating", toGo: 1, done: 24, span: 25 });
    expect(html).toContain("It hatches after 1 more delivery.");
  });

  it("offers Hatch when the egg is ready", () => {
    const html = ready({ kind: "ready" });
    expect(html).toContain("Your egg is ready");
    expect(html).toMatch(/<a[^>]*href="\/aviary\/hatch"[^>]*>Hatch<\/a>/);
    expect(css).toMatch(/\.hatch\s*{[^}]*min-height:\s*var\(--coo-touch\)/);
  });

  it("says the egg waits when no perch is free", () => {
    const html = ready({ kind: "waiting" });
    expect(html).toContain("Your egg is ready");
    expect(html).toContain("No free perch. The egg can wait.");
    expect(html).not.toContain(">Hatch<");
    expect(html).toMatch(/<a[^>]*href="\/shop"[^>]*>/);
  });

  it("paints the card sky blue with the ink line and shadow", () => {
    expect(css).toMatch(/\.egg\s*{[^}]*background:\s*var\(--coo-sky\)/);
    expect(css).toMatch(/\.egg\s*{[^}]*border:\s*var\(--coo-line\)/);
    expect(css).toMatch(/\.egg\s*{[^}]*box-shadow:\s*var\(--coo-shadow-2\)/);
    expect(css).toMatch(/\.fill\s*{[^}]*background:\s*var\(--coo-mint\)/);
  });
});

describe("/aviary who might hatch (ac-1)", () => {
  const html = ready(null, BREEDS);
  const cards = html.split("<li").slice(1);

  it("heads the section with the breed count", () => {
    expect(html).toMatch(/<h2[^>]*>Who might hatch<\/h2>/);
    expect(html).toContain(">3 breeds<");
  });

  it("draws one card per breed with its bird, name, note and trait chip", () => {
    expect(cards).toHaveLength(3);
    expect(cards[0]).toMatch(/role="img"[^>]*aria-label="Fantail pigeon"/);
    expect(cards[0]).toContain(">Fantail<");
    expect(cards[0]).toContain(">Slow, gorgeous, knows it.<");
    expect(cards[0]).toContain(">Friends tip double<");
  });

  it("marks only the breeds already in the loft", () => {
    expect(cards[0]).not.toContain("In the loft");
    expect(cards[1]).toContain(">In the loft<");
    expect(cards[2]).not.toContain("In the loft");
  });

  it("turns the tumbler upside down as drawn", () => {
    expect(cards[2]).toContain("transform:rotate(180deg)");
    expect(cards[0]).not.toContain("rotate(180deg)");
  });

  it("lays the cards out two across in shrinking columns", () => {
    expect(css).toMatch(
      /\.breeds\s*{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
    );
    expect(css).toMatch(/\.breed\s*{[^}]*min-width:\s*0/);
  });

  it("draws no section when no breed can hatch", () => {
    expect(ready(null)).not.toContain("Who might hatch");
  });
});

describe("/aviary states (ac-2)", () => {
  it("shows the loader while GET /api/aviary is pending", () => {
    const html = renderToStaticMarkup(
      <SyncContext.Provider
        value={{ data: null, error: null, offsetMs: 0, refresh: () => {} }}
      >
        <ToastProvider>
          <AviaryPage />
        </ToastProvider>
      </SyncContext.Provider>,
    );
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain("perches");
  });

  it("shows the API's message and a retry when the load fails", () => {
    const html = renderToStaticMarkup(
      <AviaryView
        state={{ kind: "failed", message: "Sign in first." }}
        onRetry={() => {}}
      />,
    );
    expect(html).toMatch(/<h1[^>]*>Aviary<\/h1>/);
    expect(html).toContain("Sign in first.");
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>Try again<\/button>/);
    expect(html).not.toContain("perches");
  });
});
