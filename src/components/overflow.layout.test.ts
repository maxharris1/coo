import { describe, expect, it } from "vitest";
import { declaration, type Ref } from "../app/safeArea.testkit";

const TRACKER = "components/Tracker.module.css";
const GLOBALS = "app/globals.css";
const at = (file: string, rule: string, prop: string): Ref => ({
  file,
  rule,
  prop,
});
const has = (ref: Ref) => {
  try {
    return declaration(ref);
  } catch {
    return undefined;
  }
};

describe("shared long-string utilities", () => {
  it("coo-wrap lets a flex or grid child shrink and breaks long words", () => {
    expect(declaration(at(GLOBALS, "coo-wrap", "min-width"))).toBe("0");
    expect(declaration(at(GLOBALS, "coo-wrap", "overflow-wrap"))).toBe(
      "anywhere",
    );
  });

  it("coo-truncate keeps one line and ellipsizes", () => {
    expect(declaration(at(GLOBALS, "coo-truncate", "min-width"))).toBe("0");
    expect(declaration(at(GLOBALS, "coo-truncate", "overflow"))).toBe("hidden");
    expect(declaration(at(GLOBALS, "coo-truncate", "text-overflow"))).toBe(
      "ellipsis",
    );
    expect(declaration(at(GLOBALS, "coo-truncate", "white-space"))).toBe(
      "nowrap",
    );
  });
});

describe("tracker stats stay inside their cards (ac-2)", () => {
  it("never forces a stat value onto one unclipped line", () => {
    expect(has(at(TRACKER, "value", "white-space"))).toBeUndefined();
    expect(has(at(TRACKER, "label", "white-space"))).toBeUndefined();
  });

  it("lets each stat card shrink to its grid column", () => {
    expect(declaration(at(TRACKER, "stats", "grid-template-columns"))).toBe(
      "repeat(3, minmax(0, 1fr))",
    );
    expect(declaration(at(TRACKER, "stat", "min-width"))).toBe("0");
  });

  it("steps the value down from 17px to 14px on narrow phones", () => {
    expect(declaration(at(TRACKER, "value", "font-size"))).toBe(
      "clamp(14px, 4.4vw, 17px)",
    );
  });
});

describe("tracker headline wraps inside its words column (ac-3)", () => {
  it("balances the headline and keeps the words column shrinkable", () => {
    expect(declaration(at(TRACKER, "headline", "text-wrap"))).toBe("balance");
    expect(declaration(at(TRACKER, "words", "min-width"))).toBe("0");
  });

  it("still ellipsizes the Bird → Friend route", () => {
    expect(declaration(at(TRACKER, "route span", "overflow"))).toBe("hidden");
    expect(declaration(at(TRACKER, "route span", "text-overflow"))).toBe(
      "ellipsis",
    );
    expect(declaration(at(TRACKER, "route span", "white-space"))).toBe(
      "nowrap",
    );
  });
});

describe("progress places never collide with the miles (ac-4)", () => {
  it("gives each place a shrinkable column either side of the miles", () => {
    expect(declaration(at(TRACKER, "ends", "display"))).toBe("grid");
    expect(declaration(at(TRACKER, "ends", "grid-template-columns"))).toBe(
      "minmax(0, 1fr) auto minmax(0, 1fr)",
    );
    expect(declaration(at(TRACKER, "to", "text-align"))).toBe("end");
  });
});
