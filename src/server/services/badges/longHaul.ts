import { config } from "@/lib/config";
import { landingBadge } from "./award";

export const longHaul = landingBadge(
  "long-haul",
  ({ distanceMi }) => distanceMi >= config.game.badges.longHaulMi,
);
