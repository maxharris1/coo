import type { Map as MapLibreMap } from "maplibre-gl";

/**
 * How long the map's credit stays open after the map first draws. The OSMF
 * attribution guidelines let an interactive map collapse its credit after five
 * seconds or on the first interaction, as long as an (i) button reopens it.
 */
export const ATTRIBUTION_OPEN_MS = 5000;

type MapEvents = Pick<MapLibreMap, "on" | "off">;
type Root = { querySelector?: ParentNode["querySelector"] };

const COMPACT = ".maplibregl-ctrl-attrib.maplibregl-compact";
const SHOWN = "maplibregl-compact-show";

/**
 * Shows MapLibre's compact attribution open when the map first draws, then
 * folds it to its (i) button after `afterMs` or on the first pan, zoom or tap,
 * whichever comes first. It folds once: a tap on (i) reopens it for good, and a
 * style swap does not reopen it. Returns a function that stops the timer and
 * the listeners.
 */
export function collapseAttributionSoon(
  map: MapEvents,
  root: Root,
  afterMs: number = ATTRIBUTION_OPEN_MS,
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let wanted = false;
  let stopped = false;

  const fold = () => {
    if (!wanted || stopped) return;
    const control = root.querySelector?.<HTMLElement>(COMPACT);
    // Not compact yet (its text arrives with the tiles): try again on data.
    if (!control) return;
    control.classList.remove(SHOWN);
    control.removeAttribute("open");
    stop();
  };
  const request = () => {
    wanted = true;
    fold();
  };
  const onMove = (e: { originalEvent?: unknown }) => {
    if (e.originalEvent) request();
  };
  const onLoad = () => {
    if (!stopped && timer === undefined) timer = setTimeout(request, afterMs);
  };

  map.on("load", onLoad);
  map.on("movestart", onMove);
  map.on("click", request);
  map.on("data", fold);

  function stop() {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    map.off("load", onLoad);
    map.off("movestart", onMove);
    map.off("click", request);
    map.off("data", fold);
  }
  return stop;
}
