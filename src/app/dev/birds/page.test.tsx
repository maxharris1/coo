import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import breeds from "../../../../config/breeds.json";
import gear from "../../../../config/gear.json";
import birds from "../../../../public/assets/data/birds.json";
import index from "../../../../public/assets/rig-reference/index.json";
import BirdsPage from "./page";

const html = renderToStaticMarkup(<BirdsPage />);

function section(title: string) {
  const chunk = html
    .split("<section")
    .find((s) => s.includes(`>${title}</h2>`));
  expect(chunk, `section "${title}"`).toBeDefined();
  return chunk!.split("</section>")[0];
}

const labels = (chunk: string) =>
  [...chunk.matchAll(/role="img" aria-label="([^"]*)"/g)].map((m) => m[1]);

const decode = (s: string) => s.replaceAll("&#x27;", "'");

const SHEET_POSES = [
  "Perched",
  "Asleep",
  "Eating",
  "Sulking",
  "Startled",
  "Crouch",
  "Just landed",
  "Proud",
  "Flight",
];

describe("/dev/birds", () => {
  it("labels every section by its heading", () => {
    const ids = [...html.matchAll(/<section aria-labelledby="([^"]+)"/g)].map(
      (m) => m[1],
    );
    expect(ids).toHaveLength(5);
    for (const id of ids) expect(html).toContain(`<h2 id="${id}"`);
  });

  it("shows the five city birds in the flock with speed", () => {
    const flock = decode(section("The flock"));
    const city = Object.values(birds).flatMap((b) => ("breed" in b ? [] : [b]));
    expect(labels(flock)).toEqual(city.map((b) => b.name));
    for (const b of city) {
      expect(flock).toContain(b.note);
      expect(flock).toContain(`${b.speed}.`);
    }
  });

  it("shows one bird per look and pose, each labelled distinctly", () => {
    const poses = section("Every look in every pose");
    const expected = Object.values(birds).flatMap((b) =>
      SHEET_POSES.map((p) => `${b.name} ${p}`),
    );
    expect(labels(poses)).toEqual(expected);
    expect(new Set(expected).size).toBe(99);
  });

  it("names every breed in the pose rows", () => {
    const poses = section("Every look in every pose");
    for (const b of breeds.breeds) expect(poses).toContain(`>${b.name}<`);
  });

  it("dresses Gerald in each reference set, perched and flying, with icons", () => {
    const dressed = section("Dressed");
    expect(labels(dressed)).toHaveLength(12);
    const sets = index.files.filter(
      (f) => f.look === "gerald" && f.file.split("--").length === 3,
    );
    expect(sets).toHaveLength(12);
    for (const f of sets) {
      const set = f.file.split("--")[2].replace(".svg", "");
      const card = dressed
        .split("<article")
        .find((a) => a.includes(`>${set}</h3>`))!;
      for (const id of f.gear)
        expect(card).toContain(`src="/assets/svg/gear/icons/${id}.svg"`);
    }
  });

  it("shows every gear item with slot, price, effect and icon", () => {
    const shop = decode(section("Gear"));
    expect(shop.match(/<article/g)).toHaveLength(15);
    for (const item of gear.items) {
      const card = shop
        .split("<article")
        .find((a) => a.includes(`>${item.name}<`))!;
      const slot = item.slot[0].toUpperCase() + item.slot.slice(1);
      const starter = item.starter ? " (starter set)" : "";
      expect(card).toContain(`${slot} slot. ${item.price} seeds${starter}.`);
      expect(card).toContain(item.effect);
      expect(card).toContain(`src="/assets/svg/gear/icons/${item.id}.svg"`);
    }
  });

  it("plays Gerald's takeoff and landing", () => {
    expect(labels(section("Takeoff and landing"))).toEqual([
      "Gerald taking off",
      "Gerald landing",
    ]);
  });
});
