import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import gear from "../../config/gear.json";
import { GEAR_IDS } from "./Bird";
import { GearIcon } from "./GearIcon";

const PUBLIC = join(__dirname, "..", "..", "public");
const ICONS = join(PUBLIC, "assets", "svg", "gear", "icons");

describe("GearIcon", () => {
  it("knows exactly the icons in the directory and the gear config", () => {
    const files = readdirSync(ICONS)
      .filter((f) => f.endsWith(".svg"))
      .map((f) => f.replace(/\.svg$/, ""))
      .sort();
    expect(files).toHaveLength(15);
    expect([...GEAR_IDS].sort()).toEqual(files);
    expect(gear.items.map((i) => i.id).sort()).toEqual(files);
  });

  it("renders every icon from a file that exists", () => {
    for (const id of GEAR_IDS) {
      const src = renderToStaticMarkup(<GearIcon id={id} />).match(
        /src="([^"]+)"/,
      )![1];
      expect(src).toBe(`/assets/svg/gear/icons/${id}.svg`);
      expect(existsSync(join(PUBLIC, src)), src).toBe(true);
    }
  });

  it("is decorative without a title and labelled with one", () => {
    expect(renderToStaticMarkup(<GearIcon id="scarf" />)).toContain('alt=""');
    expect(
      renderToStaticMarkup(<GearIcon id="scarf" title="Knitted scarf" />),
    ).toContain('alt="Knitted scarf"');
  });
});
