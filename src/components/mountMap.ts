import type { Map as MapLibreMap, MapOptions } from "maplibre-gl";

type MapLib = Pick<typeof import("maplibre-gl"), "Map" | "setWorkerUrl">;

export type MountedMap = { map: MapLibreMap; dispose: () => void };

export function mountMap(
  lib: MapLib,
  container: HTMLElement,
  options: Omit<MapOptions, "container" | "attributionControl">,
  attribution: { compact: boolean },
): MountedMap {
  lib.setWorkerUrl(
    new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href,
  );
  const map = new lib.Map({
    ...options,
    container,
    attributionControl: { compact: attribution.compact },
  });

  let width = container.clientWidth;
  let height = container.clientHeight;
  const observer = new ResizeObserver(() => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (!w || !h || (w === width && h === height)) return;
    width = w;
    height = h;
    map.resize();
  });
  observer.observe(container);

  let disposed = false;
  return {
    map,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      observer.disconnect();
      map.remove();
    },
  };
}
