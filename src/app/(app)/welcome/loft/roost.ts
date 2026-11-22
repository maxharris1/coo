import { snap, type Point } from "@/lib/game/privacy";

export const STOCK_STYLE = "https://tiles.openfreemap.org/styles/liberty";

export type PlaceResult = {
  placeId: string;
  label: string;
  sublabel: string;
  kind: "neighbourhood" | "city" | "address";
};

export type Roost = Point & {
  label: string;
  city: string | null;
  placeId?: string;
};

export type LoftBody = (Point | { placeId: string }) & { centre?: true };

export type LoftState = {
  query: string;
  results: PlaceResult[];
  roost: Roost | null;
  pending: LoftBody | null;
  busy: boolean;
  error: string | null;
};

export type LoftAction =
  | { type: "query"; query: string }
  | { type: "results"; results: PlaceResult[] }
  | { type: "busy" }
  | { type: "located"; roost: Roost; pending: LoftBody | null }
  | { type: "failed"; message: string }
  | { type: "dismiss" };

export const initialLoft = (): LoftState => ({
  query: "",
  results: [],
  roost: null,
  pending: null,
  busy: false,
  error: null,
});

export function loft(state: LoftState, action: LoftAction): LoftState {
  switch (action.type) {
    case "query":
      return { ...state, query: action.query, results: [] };
    case "results":
      return { ...state, results: action.results, busy: false };
    case "busy":
      return { ...state, busy: true, error: null };
    case "located":
      return {
        ...state,
        roost: action.roost,
        pending: action.pending,
        results: [],
        busy: false,
      };
    case "failed":
      return { ...state, busy: false, error: action.message };
    case "dismiss":
      return { ...state, error: null };
  }
}

export const snappedPosition = ({
  latitude,
  longitude,
}: Pick<GeolocationCoordinates, "latitude" | "longitude">): Point =>
  snap(latitude, longitude);

export const NO_LOCATION =
  "We could not get your location. Try a search instead.";

export const position = () =>
  new Promise<Point>((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new Error(NO_LOCATION));
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve(snappedPosition(coords)),
      reject,
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 60_000 },
    );
  });

const UNREACHABLE = "We could not reach the loft. Try again.";

type Result<T> = { ok: true; data: T } | { ok: false; message: string };
type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

async function call<T>(
  fetchImpl: Fetch,
  url: string,
  init?: RequestInit,
): Promise<Result<T>> {
  try {
    const res = init ? await fetchImpl(url, init) : await fetchImpl(url);
    const json: unknown = await res.json().catch(() => null);
    if (res.ok && json !== null) return { ok: true, data: json as T };
    const message = (json as { error?: { message?: unknown } } | null)?.error
      ?.message;
    return {
      ok: false,
      message: typeof message === "string" && message ? message : UNREACHABLE,
    };
  } catch {
    return { ok: false, message: UNREACHABLE };
  }
}

export const lookHere = (point: Point, fetchImpl: Fetch = fetch) =>
  call<{
    place: { label: string; city: string | null } | null;
    message?: string;
  }>(
    fetchImpl,
    `/api/geo/here?${new URLSearchParams({ lat: String(point.lat), lon: String(point.lon) })}`,
  );

export const searchPlaces = (q: string, fetchImpl: Fetch = fetch) =>
  call<{ results: PlaceResult[]; message?: string }>(
    fetchImpl,
    `/api/geo/search?${new URLSearchParams({ q })}`,
  );

export async function saveLoft(
  body: LoftBody,
  fetchImpl: Fetch = fetch,
): Promise<Result<Roost>> {
  const result = await call<{ loft: Roost & { travelling: boolean } }>(
    fetchImpl,
    "/api/loft",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!result.ok) return result;
  const { lat, lon, label, city } = result.data.loft;
  const from = "placeId" in body ? { placeId: body.placeId } : {};
  return { ok: true, data: { lat, lon, label, city, ...from } };
}

export const townCentre = (
  { lat, lon, placeId }: Point & { placeId?: string },
  fetchImpl: Fetch = fetch,
) =>
  saveLoft(
    placeId ? { placeId, centre: true } : { lat, lon, centre: true },
    fetchImpl,
  );
