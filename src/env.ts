import { z } from "zod";

const required = z.string().min(1);

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
    APP_ENV: z.enum(["development", "preview", "production", "test"]),
    VERCEL_ENV: z.enum(["development", "preview", "production"]).optional(),
    TEST_AUTH_SECRET: required.optional(),
  })
  .superRefine((env, ctx) => {
    if (env.APP_ENV === "test" && env.VERCEL_ENV === "production") {
      ctx.addIssue({
        code: "custom",
        path: ["APP_ENV"],
        message: "APP_ENV=test is refused on Vercel production",
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const present = Object.fromEntries(
    Object.keys(envSchema.shape).flatMap((name) =>
      source[name] ? [[name, source[name]]] : [],
    ),
  );
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
