import { getEnv } from "@/env";
import { config, type Config } from "@/lib/config";
import { clockSource, type Clock } from "./clock";
import { getDb, type Db } from "./db";
import { AppError } from "./errors";
import type { Geocoder } from "./ports/geocoder";
import type { Push } from "./ports/push";
import type { Sms } from "./ports/sms";
import type { Weather } from "./ports/weather";

export interface Deps {
  db: Db;
  clock: Clock;
  weather: Weather;
  geocoder: Geocoder;
  push: Push;
  sms: Sms;
  config: Config;
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
  return { db, clock: await source(db), weather, geocoder, push, sms, config };
}
