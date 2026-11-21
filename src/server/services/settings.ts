import { z } from "zod";
import type { Deps } from "@/server/deps";
import { AppError } from "@/server/errors";
import type { UserId } from "@/server/ports/auth";
import { toMe, type Me, type Row } from "@/server/rows";
import { displayName } from "./onboarding";

const hour = z.number().int().min(0).max(23);

const SETTINGS = {
  name: { column: "name", schema: displayName(30) },
  units: { column: "units", schema: z.enum(["mi", "km"]) },
  notifyLandedIn: { column: "notify_landed_in", schema: z.boolean() },
  notifyLandedOut: { column: "notify_landed_out", schema: z.boolean() },
  notifyDelays: { column: "notify_delays", schema: z.boolean() },
  notifyHungry: { column: "notify_hungry", schema: z.boolean() },
  quietOn: { column: "quiet_on", schema: z.boolean() },
  quietStart: { column: "quiet_start", schema: hour },
  quietEnd: { column: "quiet_end", schema: hour },
  smsFallback: { column: "sms_fallback", schema: z.boolean() },
  installed: { column: "installed", schema: z.literal(true) },
} as const satisfies Record<
  string,
  { column: keyof Row<"profiles">; schema: z.ZodType }
>;

type Setting = keyof typeof SETTINGS;

const KEYS = Object.keys(SETTINGS) as Setting[];

const SHAPE = Object.fromEntries(KEYS.map((k) => [k, SETTINGS[k].schema])) as {
  [K in Setting]: (typeof SETTINGS)[K]["schema"];
};

export const SETTINGS_BODY = z
  .object(SHAPE)
  .partial()
  .extend({ account: z.string().uuid().optional() })
  .strict()
  .refine((body) => KEYS.some((k) => body[k] !== undefined), {
    message: "nothing to save",
  });

export type SettingsInput = z.infer<typeof SETTINGS_BODY>;

export async function updateSettings(
  deps: Deps,
  caller: UserId,
  input: SettingsInput,
): Promise<{ me: Me }> {
  if (input.account !== undefined && input.account !== caller) {
    throw new AppError("conflict", "Signed in as someone else now.");
  }
  const keys = KEYS.filter((k) => input[k] !== undefined);
  const set = keys.map((k, i) => `${SETTINGS[k].column} = $${i + 2}`);
  const [row] = await deps.db.query<Row<"profiles">>(
    `update profiles set ${set.join(", ")} where id = $1 returning *`,
    [caller, ...keys.map((k) => input[k])],
  );
  return { me: toMe(row) };
}
