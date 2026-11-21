import type { Step } from "../tick";
import { guestLanding } from "./guestLanding";

export const landDeliveries: Step = async (ctx) => {
  await guestLanding(ctx, []);
  return { count: 0 };
};
