import type { Db } from "../db";
import type { UserId } from "../ports/auth";

export async function grantSeeds(
  db: Db,
  caller: UserId,
  seeds: number,
): Promise<{ seeds: number }> {
  const [{ apply_seeds }] = await db.query<{ apply_seeds: number }>(
    "select apply_seeds($1, $2, 'dev_grant', null)",
    [caller, seeds],
  );
  return { seeds: apply_seeds };
}
