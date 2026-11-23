import { z } from "zod";

const required = z.string().min(1);

const deployment = z.object({
  APP_ENV: z.enum(["development", "preview", "production", "test"]),
  VERCEL_ENV: z.enum(["development", "preview", "production"]).optional(),
});

function refuseTestOnVercelProduction(
  env: z.infer<typeof deployment>,
  ctx: z.RefinementCtx,
): void {
  if (env.APP_ENV === "test" && env.VERCEL_ENV === "production") {
    ctx.addIssue({
      code: "custom",
      path: ["APP_ENV"],
      message: "APP_ENV=test is refused on Vercel production",
    });
  }
}

export const envSchema = z
  .object({
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: required,
    DATABASE_URL: required,
    CRON_SECRET: required,
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: required,
    VAPID_PRIVATE_KEY: required,
    VAPID_SUBJECT: required,
    TWILIO_ACCOUNT_SID: required,
    TWILIO_AUTH_TOKEN: required,
    TWILIO_FROM: required,
    LINK_TOKEN_PEPPER: required,
    GEOCODER_URL: z.url().default("https://photon.komoot.io"),
    WEATHER_URL: z.url().default("https://api.open-meteo.com"),
    TEST_AUTH_SECRET: required.optional(),
    VERCEL_GIT_COMMIT_SHA: required.optional(),
  })
  .extend(deployment.shape)
  .superRefine(refuseTestOnVercelProduction);

const appEnvSchema = deployment.superRefine(refuseTestOnVercelProduction);

export type Env = z.infer<typeof envSchema>;

function presentOnly(
  source: Record<string, string | undefined>,
  names: string[],
): Record<string, string> {
  return Object.fromEntries(
    names.flatMap((name) => (source[name] ? [[name, source[name]]] : [])),
  );
}

export function readAppEnv(
  source: Record<string, string | undefined>,
): Env["APP_ENV"] | undefined {
  const result = appEnvSchema.safeParse(
    presentOnly(source, Object.keys(deployment.shape)),
  );
  return result.success ? result.data.APP_ENV : undefined;
}

export function parseEnv(source: Record<string, string | undefined>): Env {
  const present = presentOnly(source, Object.keys(envSchema.shape));
  const result = envSchema.safeParse(present);
  if (result.success) return result.data;

  const names = [...new Set(result.error.issues.map((i) => String(i.path[0])))];
  const missing = names.filter((name) => !(name in present));
  const invalid = names.filter((name) => name in present);
  const parts = [
    missing.length > 0 && `missing ${missing.join(", ")}`,
    invalid.length > 0 && `invalid ${invalid.join(", ")}`,
  ].filter(Boolean);
  throw new Error(
    `Environment variables are not set correctly: ${parts.join("; ")}`,
  );
}

let cached: Env | undefined;

export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
