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

const LEET: Readonly<Record<string, string>> = {
  "0": "o",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "8": "b",
  "@": "a",
  $: "s",
};

const BLOCKED_PATTERNS = BLOCKED_NAMES.map(
  (term) => new RegExp(term.replace(/[il]/g, (ch) => `[${ch}1]`)),
);

export function isBlocked(name: string): boolean {
  const folded = name.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
  const collapsed = [...folded]
    .map((ch) => LEET[ch] ?? ch)
    .join("")
    .replace(/[^a-z1]/g, "");
  return BLOCKED_PATTERNS.some((pattern) => pattern.test(collapsed));
}
