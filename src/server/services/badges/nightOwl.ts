import { landingBadge } from "./award";

export const nightOwl = landingBadge("night-owl", ({ plan }) => {
  const firstFly = plan.segments.findIndex((s) => s.kind === "fly");
  return (
    firstFly >= 0 &&
    plan.segments.slice(firstFly + 1).some((s) => s.kind === "roost")
  );
});
