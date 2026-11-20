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

const WORD_CHAR = "[\\p{L}\\p{N}]";
const SYMBOL_GAP = "[^a-z\\s\\p{P}]*";
const PUNCTUATION_GAP = "[^a-z\\s\\p{Pd}]*";
const IN_WORD_GAP = `(?:${SYMBOL_GAP}|(?<!${WORD_CHAR}.)${PUNCTUATION_GAP}|${PUNCTUATION_GAP}(?=.(?!${WORD_CHAR})))`;
const ANY_GAP = "[^a-z]*";
const NORMALIZED_PUNCTUATION = "\u00a4";

const JOIN_MIN_LETTERS = 2;

function letterAt(term: string, index: number): string {
  const subs = [...(LETTER_CLASSES[term[index]] ?? term[index])];
  const marks = subs.filter((sub) => /\p{P}/u.test(sub)).join("");
  const inside =
    index >= JOIN_MIN_LETTERS && term.length - index > JOIN_MIN_LETTERS;
  if (!marks || inside) return `[${subs.join("")}]`;
  const others = subs.filter((sub) => !marks.includes(sub)).join("");
  return `(?:[${others}]|(?<!${WORD_CHAR})[${marks}]|[${marks}](?!${WORD_CHAR}))`;
}

const BLOCKED_PATTERNS = BLOCKED_NAMES.map((term) => {
  const letters = [...term].map((ch) => `[${LETTER_CLASSES[ch] ?? ch}]`);
  const inWord = [...term]
    .map((_, index) => letterAt(term, index))
    .join(IN_WORD_GAP);
  const wholeSpan = `(?<!${WORD_CHAR})${letters.join(ANY_GAP)}(?!${WORD_CHAR})`;
  return new RegExp(`${inWord}|${wholeSpan}`, "su");
});

function fold(name: string): string {
  return [...name]
    .map((ch) => {
      const plain = ch.normalize("NFKD").replace(/\p{M}/gu, "");
      return /\p{P}/u.test(ch)
        ? plain
        : plain.replace(/\p{P}/gu, NORMALIZED_PUNCTUATION);
    })
    .join("")
    .toLowerCase();
}

export function isBlocked(name: string): boolean {
  const folded = fold(name);
  return BLOCKED_PATTERNS.some((pattern) => pattern.test(folded));
}
