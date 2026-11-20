import { describe, expect, it } from "vitest";
import { BLOCKED_NAMES, LETTER_CLASSES, isBlocked } from "./blocklist";

const DIGITS: Record<string, string> = {
  a: "4",
  e: "3",
  i: "1",
  o: "0",
  s: "5",
  t: "7",
};
const ACCENTS: Record<string, string> = {
  a: "á",
  e: "é",
  i: "ï",
  o: "ö",
  u: "ü",
  n: "ñ",
  c: "ç",
};

const swap = (word: string, table: Record<string, string>) =>
  [...word].map((ch) => table[ch] ?? ch).join("");

const variants = (word: string) => ({
  upper: word.toUpperCase(),
  title: word[0].toUpperCase() + word.slice(1),
  accents: swap(word, ACCENTS),
  combining: [...word].map((ch) => `${ch}́`).join(""),
  spacing: [...word].join(" "),
  punctuation: [...word].join("."),
  mixedPunctuation: [...word].join("-_*"),
  digits: swap(word, DIGITS),
  symbols: word.replace(/a/g, "@").replace(/s/g, "$"),
  atSeparated: [...word].join("@"),
  dollarSeparated: [...word].join("$"),
  symbolsSeparated: [...word.replace(/a/g, "@").replace(/s/g, "$")].join("@"),
  embedded: `the ${word} bird`,
  everything: ` ${[...swap(word.toUpperCase(), { A: "4", E: "3", I: "1", O: "0" })].join(". ")}! `,
});

const substitutions = (word: string) =>
  [...new Set(word)].flatMap((letter) =>
    [...(LETTER_CLASSES[letter] ?? "")]
      .filter((sub) => sub !== letter)
      .map((sub) => [`${letter} -> ${sub}`, word.replaceAll(letter, sub)]),
  );

describe("LETTER_CLASSES", () => {
  it.each([
    ["g", "96"],
    ["o", "0"],
    ["i", "1!|"],
    ["l", "1!|"],
    ["e", "3"],
    ["a", "4@"],
    ["s", "5$"],
    ["t", "7"],
    ["b", "8"],
  ])("maps %s to each of %s", (letter, subs) => {
    for (const sub of subs) expect(LETTER_CLASSES[letter]).toContain(sub);
  });
});

describe("isBlocked", () => {
  it("has a list to check", () => {
    expect(BLOCKED_NAMES.length).toBeGreaterThan(0);
  });

  describe.each(BLOCKED_NAMES)("listed name #%#", (word) => {
    it("flags the plain name", () => {
      expect(isBlocked(word)).toBe(true);
    });

    it.each(substitutions(word))("flags %s", (_, variant) => {
      expect(isBlocked(variant)).toBe(true);
    });

    it.each(Object.entries(variants(word)))(
      "flags the %s variant",
      (_, variant) => {
        expect(isBlocked(variant)).toBe(true);
      },
    );
  });

  it.each(["ni99er", "ni99a", "ra9head", "fa99ot", "mon9oloid", "ni66er"])(
    "flags %j",
    (name) => {
      expect(isBlocked(name)).toBe(true);
    },
  );

  it.each([
    "n i g g e r@",
    "@n i g g e r",
    "$n-i-g-g-e-r$",
    "!n i g g e r!",
    "(n-i-g-g-e-r)",
    "n@i@g@g@e@r",
  ])("flags %j with punctuation around it", (name) => {
    expect(isBlocked(name)).toBe(true);
  });

  it.each(["Bobn@i@g@g@e@r", "xn!i|g#g§e@rx", "mrn$i+g^g<e{r", "ret@rdo"])(
    "flags %j with symbols inside a longer word",
    (name) => {
      expect(isBlocked(name)).toBe(true);
    },
  );

  it.each(["xn\u2a74iggerx", "x\u24a9iggerx"])(
    "flags %j where a symbol normalizes to punctuation inside a word",
    (name) => {
      expect(isBlocked(name)).toBe(true);
    },
  );

  it.each([
    "Max",
    "Gerald",
    "Zoë",
    "Chloé",
    "José",
    "Mary-Jane",
    "O'Brien",
    "Raccoon",
    "Spice",
    "Pigeon 42",
    "Sir Flaps-a-Lot",
    "Margaret Arden",
    "Bret Arden",
    "Bret-Arden",
    "Margaret.Arden",
    "Bret.Arden",
    "Bret_Arden",
    "Bret/Arden",
    "Bret,Arden",
    "Bret:Arden",
    "Bret'Arden",
    "Bret*Arden",
    "Margaret!Arden",
    "Bret!Arden",
    "Bret#Arden",
    "Bret(Arden",
    "Bret@Arden",
    "Bret{Arden",
    "",
  ])("passes %j", (name) => {
    expect(isBlocked(name)).toBe(false);
  });
});
