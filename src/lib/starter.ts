import { config } from "@/lib/config";

const { start } = config.game;

export function roommateOwed(birdCount: number, perches: number): boolean {
  return birdCount < start.birds.length && birdCount < perches;
}

export function nextStarterLook(look: string): string {
  const { looks } = start;
  return looks[(looks.indexOf(look) + 1) % looks.length];
}
