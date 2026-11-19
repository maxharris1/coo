# T013. Weather

Phase: 1 The core loop  
Depends on: T007

## Goal

Real weather for a route, now and for the coming hours, with a safe fallback.

## Read first

- `docs/09-map.md (Weather)`
- `docs/04-game-rules.md (5)`

## Build

- The Open-Meteo adapter behind the `Weather` port: `sample(points, atMs)` → `WeatherSample[]`, using current values for now and hourly values for a future hour. One request for several points. Read their current docs first.
- `weather_cache` by 0.1° cell and hour, 10 minutes.
- On any failure or timeout (2 seconds) return the fallback from config and `{ fallback: true }`.

## Done when

- [ ] A recorded Open-Meteo response (saved as a fixture; fetch it once by hand and commit it) maps to the expected samples: mph, °F, mm per hour, snow flag.
- [ ] A second call inside 10 minutes makes no request.
- [ ] A failing fetch returns the fallback and never throws.
- [ ] Type check, lint and the whole test suite pass.
