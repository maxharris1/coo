import { getEnv, type Env } from "@/env";
import { config, type Config } from "@/lib/config";
import { clockSource, type Clock } from "./clock";
import { getDb, type Db } from "./db";
import { AppError } from "./errors";
import type { AuthPort, SessionJar } from "./ports/auth";
import type { Geocoder } from "./ports/geocoder";
import type { Push } from "./ports/push";
import type { Sms } from "./ports/sms";
import type { Weather } from "./ports/weather";
import { supabaseAuth } from "./supabase/server";
import { testAuth } from "./testAuth";

export interface Deps {
  db: Db;
  clock: Clock;
  weather: Weather;
  geocoder: Geocoder;
  push: Push;
  sms: Sms;
  config: Config;
  auth: (jar: SessionJar) => AuthPort;
}

export type AuthEnv = Pick<
  Env,
  | "APP_ENV"
  | "VERCEL_ENV"
  | "TEST_AUTH_SECRET"
  | "NEXT_PUBLIC_SUPABASE_URL"
  | "NEXT_PUBLIC_SUPABASE_ANON_KEY"
>;

export function authFor(
  jar: SessionJar,
  env: AuthEnv,
  db: Db,
  clock: Clock,
): AuthPort {
  return env.APP_ENV === "test"
    ? testAuth(jar, env, db, clock)
    : supabaseAuth(jar, env);
}

function notWired(port: string): Promise<never> {
  return Promise.reject(new AppError("internal", `${port} is not wired yet`));
}

const weather: Weather = { samples: () => notWired("weather") };
const geocoder: Geocoder = {
  search: () => notWired("geocoder"),
  reverse: () => notWired("geocoder"),
};
const push: Push = { send: () => notWired("push") };
const sms: Sms = { send: () => notWired("sms") };

let source: ReturnType<typeof clockSource> | undefined;

export async function makeDeps(): Promise<Deps> {
  const db = getDb();
  source ??= clockSource(getEnv().APP_ENV);
  const clock = await source(db);
  return {
    db,
    clock,
    weather,
    geocoder,
    push,
    sms,
    config,
    auth: (jar) => authFor(jar, getEnv(), db, clock),
  };
}
