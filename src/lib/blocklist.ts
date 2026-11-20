export const BLOCKED_NAMES: readonly string[] = [
  "nigger",
  "nigga",
  "chink",
  "wetback",
  "beaner",
  "raghead",
  "towelhead",
  "faggot",
  "tranny",
  "retard",
  "mongoloid",
];

export const LETTER_CLASSES: Readonly<Record<string, string>> = {
  a: "a4@^",
  b: "b8",
  c: "c(<{¢",
  e: "e3€",
  g: "g96",
  h: "h#",
  i: "i1!|",
  l: "l1!|",
  o: "o0",
  s: "s5$§",
  t: "t7+",
  z: "z2",
};

const IN_WORD_GAP = "[^a-z\\s\\p{Pd}]*";
const ANY_GAP = "[^a-z]*";
const WORD_EDGE = "[\\p{L}\\p{N}]";

const BLOCKED_PATTERNS = BLOCKED_NAMES.map((term) => {
  const letters = [...term].map((ch) => `[${LETTER_CLASSES[ch] ?? ch}]`);
  const inWord = letters.join(IN_WORD_GAP);
  const wholeSpan = `(?<!${WORD_EDGE})${letters.join(ANY_GAP)}(?!${WORD_EDGE})`;
  return new RegExp(`${inWord}|${wholeSpan}`, "u");
});

export function isBlocked(name: string): boolean {
  const folded = name.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
  return BLOCKED_PATTERNS.some((pattern) => pattern.test(folded));
}
