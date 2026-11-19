import { describe, expect, it } from "vitest";
import { parseEnv } from "@/env";

const full = {
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.example",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key-value",
  DATABASE_URL: "postgres://user:pw@db.example:6543/postgres",
  CRON_SECRET: "cron-secret-value",
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: "vapid-public-value",
  VAPID_PRIVATE_KEY: "vapid-private-value",
  VAPID_SUBJECT: "mailto:ops@example.test",
  TWILIO_ACCOUNT_SID: "twilio-sid-value",
  TWILIO_AUTH_TOKEN: "twilio-token-value",
  TWILIO_FROM: "+15550000000",
  LINK_TOKEN_PEPPER: "pepper-value",
  GEOCODER_URL: "https://geocoder.example",
  WEATHER_URL: "https://weather.example",
  APP_ENV: "preview",
};

function errorFrom(run: () => unknown): Error {
  try {
    run();
  } catch (error) {
    if (error instanceof Error) return error;
  }
  throw new Error("expected parseEnv to throw an Error");
}

describe("parseEnv", () => {
  it("parses a complete environment", () => {
    expect(parseEnv(full)).toEqual(full);
  });

  it("names every missing variable in one error without leaking values", () => {
    const error = errorFrom(() =>
      parseEnv({ ...full, CRON_SECRET: undefined, TWILIO_AUTH_TOKEN: "" }),
    );
    expect(error.message).toContain("CRON_SECRET");
    expect(error.message).toContain("TWILIO_AUTH_TOKEN");
    for (const value of Object.values(full)) {
      expect(error.message).not.toContain(value);
    }
  });

  it("names an invalid variable without echoing its value", () => {
    const error = errorFrom(() =>
      parseEnv({ ...full, APP_ENV: "staging-secret" }),
    );
    expect(error.message).toContain("APP_ENV");
    expect(error.message).not.toContain("staging-secret");
  });

  it("defaults the geocoder and weather URLs", () => {
    const env = parseEnv({
      ...full,
      GEOCODER_URL: undefined,
      WEATHER_URL: "",
    });
    expect(env.GEOCODER_URL).toBe("https://photon.komoot.io");
    expect(env.WEATHER_URL).toBe("https://api.open-meteo.com");
  });
});
