import { landingBadge } from "./award";

export const fullCard = landingBadge("full-card", async ({ ownerId }, db) => {
  const [{ paid }] = await db.query<{ paid: boolean }>(
    "select exists (select 1 from punch_cards where user_id = $1 and paid) as paid",
    [ownerId],
  );
  return paid;
});
