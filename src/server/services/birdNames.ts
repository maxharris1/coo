import { sameBirdName } from "@/lib/birdName";
import type { Db } from "@/server/db";
import { AppError } from "@/server/errors";

export const nameTaken = (name: string) =>
  new AppError("conflict", `You already have a bird called ${name}.`);

export async function assertBirdNameFree(
  db: Db,
  owner: string,
  name: string,
  except?: string,
): Promise<void> {
  const flock = await db.query<{ id: string; name: string }>(
    "select id, name from birds where owner_id = $1",
    [owner],
  );
  const clash = flock.find(
    (b) => b.id !== except && sameBirdName(b.name, name),
  );
  if (clash) throw nameTaken(clash.name);
}
