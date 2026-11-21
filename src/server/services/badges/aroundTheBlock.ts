import { config } from "@/lib/config";
import { landingBadge } from "./award";

export const aroundTheBlock = landingBadge(
  "around-the-block",
  ({ distanceMi }) => distanceMi < config.game.badges.aroundTheBlockUnderMi,
);
