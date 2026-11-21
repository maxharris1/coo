export const PLACES = [
  { id: "new-york", label: "New York", center: [-73.9855, 40.758] },
  { id: "rural-pa", label: "Rural Pennsylvania", center: [-77.3, 41.75] },
  { id: "cape-cod", label: "Cape Cod", center: [-70.185, 42.05] },
] as const;

export const ZOOMS = [3, 6, 9, 12, 15, 17] as const;

export type Place = (typeof PLACES)[number];
export type Zoom = (typeof ZOOMS)[number];
export type View = { place: Place; zoom: Zoom };

export function parseView(
  params: Record<string, string | string[] | undefined>,
): View {
  return {
    place: PLACES.find((p) => p.id === params.place) ?? PLACES[0],
    zoom: ZOOMS.find((z) => `${z}` === params.zoom) ?? ZOOMS[0],
  };
}

export const viewHref = ({ place, zoom }: View) =>
  `/dev/map?place=${place.id}&zoom=${zoom}`;
