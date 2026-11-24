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

type Clickable = Pick<HTMLElement, "addEventListener" | "removeEventListener">;

/**
 * For a preview map inside a link: the credit stays open, so a tap on it is
 * kept from MapLibre's (i) toggle and from the link around the map. A tap on
 * one of the credit's own links still opens that link. Returns a function that
 * removes the listener.
 */
export function keepCreditOpen(root: Clickable): () => void {
  const onClick = (e: Event) => {
    const target = e.target as Element | null;
    const credit = target?.closest?.(".maplibregl-ctrl-attrib");
    if (!credit) return;
    e.stopPropagation();
    const link = target?.closest("a");
    if (!link || !credit.contains(link)) e.preventDefault();
  };
  root.addEventListener("click", onClick, true);
  return () => root.removeEventListener("click", onClick, true);
}
