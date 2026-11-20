import type { Deps } from "@/server/deps";
import type { UserId } from "@/server/ports/auth";
import { toMe, type Me, type Row } from "@/server/rows";

export type SettingsInput = { installed: true };

export async function updateSettings(
  deps: Deps,
  caller: UserId,
  input: SettingsInput,
): Promise<{ me: Me }> {
  const [row] = await deps.db.query<Row<"profiles">>(
    "update profiles set installed = $2 where id = $1 returning *",
    [caller, input.installed],
  );
  return { me: toMe(row) };
}
