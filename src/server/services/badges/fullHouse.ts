import { landingBadge } from "./award";

export const fullHouse = landingBadge("full-house", async ({ ownerId }, db) => {
  const [{ n }] = await db.query<{ n: number }>(
    "select count(*)::int as n from birds where owner_id = $1",
    [ownerId],
  );
  return n;
});
