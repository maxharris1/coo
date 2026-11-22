const birdNameKey = (name: string): string => name.trim().toLowerCase();

export const sameBirdName = (a: string, b: string): boolean =>
  birdNameKey(a) === birdNameKey(b);

export function freeBirdName(
  preferred: string,
  taken: readonly string[],
  pool: readonly string[],
): string {
  const isFree = (name: string) => !taken.some((t) => sameBirdName(t, name));
  return isFree(preferred) ? preferred : (pool.find(isFree) ?? preferred);
}
