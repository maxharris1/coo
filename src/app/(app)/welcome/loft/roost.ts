import emptyStates from "../../../../../assets/copy/empty-states.json";
import { snap, type Point } from "@/lib/game/privacy";

export const STOCK_STYLE = "https://tiles.openfreemap.org/styles/liberty";

export type PlaceResult = {
  placeId: string;
  label: string;
  sublabel: string;
  kind: "neighbourhood" | "city" | "address";
};

export type Roost = Point & { label: string; city: string | null };

export type LoftBody = Point | { placeId: string };

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

const UNREACHABLE = "We could not reach the loft. Try again.";
const PLACE_NOT_FOUND = emptyStates.find(
  (s) => s.state === "Place not found",
)!.text;

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
  return { ok: true, data: { lat, lon, label, city } };
}

export async function townCentre(
  city: string,
  fetchImpl: Fetch = fetch,
): Promise<Result<Roost>> {
  const found = await searchPlaces(city, fetchImpl);
  if (!found.ok) return found;
  const centre = found.data.results.find((r) => r.kind === "city");
  if (!centre) {
    return { ok: false, message: found.data.message ?? PLACE_NOT_FOUND };
  }
  return saveLoft({ placeId: centre.placeId }, fetchImpl);
}
