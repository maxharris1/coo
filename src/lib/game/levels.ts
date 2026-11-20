import { config } from "@/lib/config";

const levels = config.game.levels;

export function levelFor(miles: number): number {
  return Math.min(
    levels.max,
    1 + Math.floor(Math.sqrt(Math.max(0, miles) / levels.milesPerLevelSquared)),
  );
}

export function rangeFor(speedMph: number): number {
  return (
    Math.round((speedMph * levels.rangePerMph) / levels.rangeRoundMi) *
    levels.rangeRoundMi
  );
}
