import { config } from "@/lib/config";
import { landingBadge } from "./award";

export const cherAmi = landingBadge("cher-ami", ({ input }) =>
  input.weather.some((w) => w.precipMmH >= config.game.engine.downpourMmH),
);
