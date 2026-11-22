const held = new Map<string, string>();

export function holdLink(flightId: string, url: string): void {
  held.set(flightId, url);
}

export function takeLink(flightId: string): string | undefined {
  const url = held.get(flightId);
  held.delete(flightId);
  return url;
}
