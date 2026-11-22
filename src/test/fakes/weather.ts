import type { WeatherSample } from "@/lib/flight/engine";
import { config } from "@/lib/config";
import type { Weather, WeatherQuery } from "@/server/ports/weather";

export class FakeWeather implements Weather {
  private sample: WeatherSample = config.game.weather.fallback;
  private failing = false;
  queries: WeatherQuery[] = [];

  async samples(at: WeatherQuery[]): Promise<WeatherSample[]> {
    this.queries.push(...at);
    if (this.failing) {
      this.failing = false;
      throw new Error("weather unavailable");
    }
    return at.map(() => structuredClone(this.sample));
  }

  set(sample: WeatherSample): void {
    this.sample = structuredClone(sample);
  }

  failNext(): void {
    this.failing = true;
  }
}
