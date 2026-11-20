import type { WeatherSample } from "@/lib/flight/engine";
import type { Deps } from "@/server/deps";
import { log } from "@/server/log";
import type { WeatherQuery } from "@/server/ports/weather";

const TIMEOUT_MS = 2000;
const REASON_MAX_LENGTH = 200;
const DECIMAL = /-?\d+\.\d+/g;

type ErrorSummary = { errorType: string; reason: string };

const UNDESCRIBABLE: ErrorSummary = {
  errorType: "unknown",
  reason: "undescribable error",
};

function sanitize(text: string): string {
  return text.replace(DECIMAL, "[redacted]").slice(0, REASON_MAX_LENGTH);
}

function describeError(error: unknown): ErrorSummary {
  try {
    if (error instanceof Error) {
      return {
        errorType: sanitize(String(error.name)),
        reason: sanitize(String(error.message)),
      };
    }
    if (typeof error === "string") {
      return { errorType: "string", reason: sanitize(error) };
    }
    return {
      errorType: error === null ? "null" : typeof error,
      reason: "non-error thrown",
    };
  } catch {
    return UNDESCRIBABLE;
  }
}

export async function sampleWeather(
  deps: Deps,
  at: WeatherQuery[],
): Promise<{ samples: WeatherSample[]; fallback: boolean }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const samples = await Promise.race([
      deps.weather.samples(at),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`weather timed out after ${TIMEOUT_MS} ms`)),
          TIMEOUT_MS,
        );
      }),
    ]);
    if (samples.length !== at.length) {
      throw new Error(
        `weather answered ${samples.length} samples for ${at.length} queries`,
      );
    }
    return { samples, fallback: false };
  } catch (error) {
    log.warn("weather.fallback", describeError(error));
    return {
      samples: at.map(() => structuredClone(deps.config.game.weather.fallback)),
      fallback: true,
    };
  } finally {
    clearTimeout(timer);
  }
}
