import type { BirdState, FlightInput, FlightPlan } from "@/lib/flight/engine";
import type { PlaceNames } from "./placeNames";

type CareKeys = "belly" | "feathers" | "energy";

export type PersonLite = { id: string; name: string; handle: string };
export type BirdLite = {
  id: string;
  name: string;
  look: string;
  gear: string[];
};
export type Place = { lat: number; lon: number; label: string };
export type FlightInputPublic = Omit<FlightInput, "bird"> & {
  bird: Omit<BirdState, CareKeys>;
};

export type Flight = {
  id: string;
  kind: "delivery" | "return";
  status: "scheduled" | "flying" | "landed" | "cancelled";
  bird: BirdLite;
  owner: PersonLite;
  counterpart?: PersonLite;
  guestName?: string;
  from: Place;
  to: Place;
  releaseAt: number;
  arriveAt?: number;
  distanceMi?: number;
  odds?: number;
  plan?: FlightPlan;
  input?: FlightInputPublic;
  placeNames: Partial<PlaceNames>;
  searchParty?: "found" | "not_found";
  role: "mine" | "incoming";
  hasNote: boolean;
};

export const FLIGHT_SELECT = `
  select f.id, f.kind, f.status, f.owner_id, f.counterpart_id,
    f.from_lat, f.from_lon, f.from_label, f.to_lat, f.to_lon, f.to_label,
    f.release_at, f.arrive_at, f.distance_mi, f.odds, f.plan, f.input,
    f.place_names, f.search_party, f.note_id is not null as has_note,
    b.id as bird_id, b.name as bird_name, b.look as bird_look, b.gear as bird_gear,
    o.name as owner_name, o.handle as owner_handle,
    c.name as counterpart_name, c.handle as counterpart_handle,
    g.recipient_name as guest_name
  from flights f
  join birds b on b.id = f.bird_id
  join profiles o on o.id = f.owner_id
  left join profiles c on c.id = f.counterpart_id
  left join guest_links g on g.id = f.guest_link_id`;

export type FlightRow = {
  id: string;
  kind: Flight["kind"];
  status: Flight["status"];
  owner_id: string;
  counterpart_id: string | null;
  from_lat: number;
  from_lon: number;
  from_label: string;
  to_lat: number;
  to_lon: number;
  to_label: string;
  release_at: Date;
  arrive_at: Date | null;
  distance_mi: number | null;
  odds: number | null;
  plan: FlightPlan | null;
  input: FlightInput | null;
  place_names: Partial<PlaceNames>;
  search_party: Flight["searchParty"] | null;
  has_note: boolean;
  bird_id: string;
  bird_name: string;
  bird_look: string;
  bird_gear: string[];
  owner_name: string;
  owner_handle: string;
  counterpart_name: string | null;
  counterpart_handle: string | null;
  guest_name: string | null;
};

function publicInput(input: FlightInput): FlightInputPublic {
  const { speedMph, focus, navigation, breed, level, sulking } = input.bird;
  return {
    ...input,
    bird: { speedMph, focus, navigation, breed, level, sulking },
  };
}

export function toFlight(r: FlightRow, viewerId: string): Flight {
  return {
    id: r.id,
    kind: r.kind,
    status: r.status,
    bird: {
      id: r.bird_id,
      name: r.bird_name,
      look: r.bird_look,
      gear: r.bird_gear,
    },
    owner: { id: r.owner_id, name: r.owner_name, handle: r.owner_handle },
    counterpart:
      r.counterpart_id && r.counterpart_name && r.counterpart_handle
        ? {
            id: r.counterpart_id,
            name: r.counterpart_name,
            handle: r.counterpart_handle,
          }
        : undefined,
    guestName: r.guest_name ?? undefined,
    from: { lat: r.from_lat, lon: r.from_lon, label: r.from_label },
    to: { lat: r.to_lat, lon: r.to_lon, label: r.to_label },
    releaseAt: r.release_at.getTime(),
    arriveAt: r.arrive_at?.getTime(),
    distanceMi: r.distance_mi ?? undefined,
    odds: r.odds ?? undefined,
    plan: r.plan ?? undefined,
    input: r.input ? publicInput(r.input) : undefined,
    placeNames: r.place_names,
    searchParty: r.search_party ?? undefined,
    role: r.owner_id === viewerId ? "mine" : "incoming",
    hasNote: r.has_note,
  };
}
