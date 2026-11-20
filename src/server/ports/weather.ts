import type { WeatherSample } from "@/lib/flight/engine";

export interface WeatherQuery {
  lat: number;
  lon: number;
  atMs: number;
}

export interface Weather {
  samples(at: WeatherQuery[]): Promise<WeatherSample[]>;
}
