import { z } from "zod";
import { config } from "@/lib/config";
import type { WeatherSample } from "@/lib/flight/engine";
import type { Clock } from "../clock";
import type { Db } from "../db";
import type { Weather, WeatherQuery } from "../ports/weather";

const TIMEOUT_MS = 2000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MIN_FORECAST_DAYS = 2;
const { cellDeg, cacheMinutes } = config.game.weather;
const TTL_MS = cacheMinutes * 60 * 1000;
const CELL_DECIMALS = String(cellDeg).split(".")[1]?.length ?? 0;
const VARIABLES = [
  "temperature_2m",
  "precipitation",
  "snowfall",
  "wind_speed_10m",
  "wind_direction_10m",
] as const;

const series = z.array(z.number());

const locationSchema = z.object({
  current: z.object({
    interval: z.number().positive(),
    temperature_2m: z.number(),
    precipitation: z.number(),
    snowfall: z.number(),
    wind_speed_10m: z.number(),
    wind_direction_10m: z.number(),
  }),
  hourly: z.object({
    time: series,
    temperature_2m: series,
    precipitation: series,
    snowfall: series,
    wind_speed_10m: series,
    wind_direction_10m: series,
  }),
});

type Location = z.infer<typeof locationSchema>;

const responseSchema = z
  .union([locationSchema, z.array(locationSchema)])
  .transform((body) => (Array.isArray(body) ? body : [body]));

interface Slot {
  cell: string;
  hour_ms: number;
}

function cellOf(lat: number, lon: number): string {
  const snap = (deg: number) =>
    (Math.round(deg / cellDeg) * cellDeg).toFixed(CELL_DECIMALS);
  return `${snap(lat)},${snap(lon)}`;
}

function hourOf(ms: number): number {
  return Math.floor(ms / HOUR_MS) * HOUR_MS;
}

const slotKey = ({ cell, hour_ms }: Slot) => `${cell}@${hour_ms}`;

function sampleAt(
  { current, hourly }: Location,
  hourMs: number,
  nowHourMs: number,
): WeatherSample {
  if (hourMs <= nowHourMs) {
    return {
      windMph: current.wind_speed_10m,
      windFromDeg: current.wind_direction_10m,
      tempF: current.temperature_2m,
      precipMmH: (current.precipitation * HOUR_MS) / (current.interval * 1000),
      snow: current.snowfall > 0,
    };
  }
  const i = hourly.time.indexOf(hourMs / 1000);
  if (i < 0) throw new Error("open-meteo has no forecast for that hour");
  return {
    windMph: hourly.wind_speed_10m[i],
    windFromDeg: hourly.wind_direction_10m[i],
    tempF: hourly.temperature_2m[i],
    precipMmH: hourly.precipitation[i],
    snow: hourly.snowfall[i] > 0,
  };
}

export function openMeteo(opts: {
  baseUrl: string;
  fetch?: typeof fetch;
}): (db: Db, clock: Clock) => Weather {
  const base = opts.baseUrl.replace(/\/+$/, "");
  const doFetch = opts.fetch ?? ((input, init) => fetch(input, init));

  async function forecast(
    cells: string[],
    lastHourMs: number,
    now: number,
  ): Promise<Location[]> {
    const todayMs = Math.floor(now / DAY_MS) * DAY_MS;
    const days = Math.floor((lastHourMs - todayMs) / DAY_MS) + 1;
    const [latitude, longitude] = [0, 1].map((part) =>
      cells.map((cell) => cell.split(",")[part]).join(","),
    );
    const query = new URLSearchParams({
      latitude,
      longitude,
      current: VARIABLES.join(","),
      hourly: VARIABLES.join(","),
      temperature_unit: "fahrenheit",
      wind_speed_unit: "mph",
      precipitation_unit: "mm",
      forecast_days: String(Math.max(MIN_FORECAST_DAYS, days)),
      timezone: "UTC",
      timeformat: "unixtime",
    });
    const res = await doFetch(`${base}/v1/forecast?${query}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      await res.body?.cancel();
      throw new Error(`open-meteo answered ${res.status}`);
    }
    const locations = responseSchema.parse(await res.json());
    if (locations.length !== cells.length) {
      throw new Error("open-meteo returned the wrong number of locations");
    }
    return locations;
  }

  return (db, clock) => ({
    async samples(at: WeatherQuery[]) {
      const now = clock.now();
      const wanted = at.map(({ lat, lon, atMs }): Slot => ({
        cell: cellOf(lat, lon),
        hour_ms: hourOf(atMs),
      }));
      const unique = [...new Map(wanted.map((s) => [slotKey(s), s])).values()];

      const rows = await db.query<Slot & { payload: WeatherSample }>(
        `select s.cell, s.hour_ms, w.payload
           from jsonb_to_recordset($1::jsonb) as s(cell text, hour_ms float8)
           join weather_cache w
             on w.cell = s.cell and w.hour = to_timestamp(s.hour_ms / 1000.0)
          where w.fetched_at > to_timestamp($2 / 1000.0)`,
        [JSON.stringify(unique), now - TTL_MS],
      );
      const found = new Map(rows.map((r) => [slotKey(r), r.payload]));

      const missing = unique.filter((s) => !found.has(slotKey(s)));
      if (missing.length > 0) {
        const cells = [...new Set(missing.map((s) => s.cell))];
        const lastHourMs = Math.max(...missing.map((s) => s.hour_ms));
        const locations = await forecast(cells, lastHourMs, now);
        const byCell = new Map(cells.map((cell, i) => [cell, locations[i]]));
        const fresh = missing.map((s) => ({
          ...s,
          payload: sampleAt(byCell.get(s.cell)!, s.hour_ms, hourOf(now)),
        }));
        await db.query(
          `insert into weather_cache (cell, hour, payload, fetched_at)
           select r.cell, to_timestamp(r.hour_ms / 1000.0), r.payload,
                  to_timestamp($2 / 1000.0)
             from jsonb_to_recordset($1::jsonb)
               as r(cell text, hour_ms float8, payload jsonb)
           on conflict (cell, hour) do update
             set payload = excluded.payload, fetched_at = excluded.fetched_at`,
          [JSON.stringify(fresh), now],
        );
        for (const s of fresh) found.set(slotKey(s), s.payload);
      }

      return wanted.map((s) => structuredClone(found.get(slotKey(s))!));
    },
  });
}
