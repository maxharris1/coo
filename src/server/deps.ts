import { getEnv, type Env } from "@/env";
import { config, type Config } from "@/lib/config";
import { openMeteo } from "./adapters/openMeteo";
import { photon } from "./adapters/photon";
import { twilio } from "./adapters/twilio";
import { webPush } from "./adapters/webPush";
import { clockSource, type Clock } from "./clock";
import { getDb, type Db } from "./db";
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

let source: ReturnType<typeof clockSource> | undefined;
let photonFor: ReturnType<typeof photon> | undefined;
let openMeteoFor: ReturnType<typeof openMeteo> | undefined;
let push: Push | undefined;
let sms: Sms | undefined;

export async function makeDeps(): Promise<Deps> {
  const db = getDb();
  source ??= clockSource(getEnv().APP_ENV);
  const clock = await source(db);
  photonFor ??= photon({ baseUrl: getEnv().GEOCODER_URL });
  openMeteoFor ??= openMeteo({ baseUrl: getEnv().WEATHER_URL });
  push ??= webPush({
    vapid: {
      subject: getEnv().VAPID_SUBJECT,
      publicKey: getEnv().NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      privateKey: getEnv().VAPID_PRIVATE_KEY,
    },
  });
  sms ??= twilio({
    accountSid: getEnv().TWILIO_ACCOUNT_SID,
    authToken: getEnv().TWILIO_AUTH_TOKEN,
    from: getEnv().TWILIO_FROM,
  });
  return {
    db,
    clock,
    weather: openMeteoFor(db, clock),
    geocoder: photonFor(db, clock),
    push,
    sms,
    config,
    auth: (jar) => authFor(jar, getEnv(), db, clock),
  };
}
