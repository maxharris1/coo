const MAX_LENGTH = 20;
const FALLBACK = "pigeon";

export function handleBase(name: string): string {
  const stem = name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, MAX_LENGTH)
    .replace(/_+$/, "");
  return stem.length >= 2 ? stem : FALLBACK;
}
