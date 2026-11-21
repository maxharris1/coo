import { landingBadge } from "./award";

export const postmaster = landingBadge(
  "postmaster",
  async ({ ownerId }, db) => {
    const [{ n }] = await db.query<{ n: number }>(
      "select count(*)::int as n from postmarks where user_id = $1",
      [ownerId],
    );
    return n;
  },
);
