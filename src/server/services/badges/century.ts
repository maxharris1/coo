import { config } from "@/lib/config";
import { landingBadge } from "./award";

export const century = landingBadge(
  "century",
  ({ distanceMi }) => distanceMi >= config.game.badges.centuryMi,
);
