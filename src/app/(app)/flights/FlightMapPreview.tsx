import { MapView, type BirdLite, type BirdState } from "@/components/MapView";
import { isDaylight, positionAt } from "@/lib/flight/engine";
import type { Flight } from "@/server/services/flights/shape";
import type { JobMap } from "../jobs/[id]/JobTracker";
import type { RowState } from "./flightsViewModel";

const POSE_STATE: Record<RowState, BirdState> = {
  scheduled: "scheduled",
  flying: "flying",
  almostHere: "flying",
  roosting: "roosting",
  delayed: "delayed",
  landed: "landed",
};

function birdAt(flight: Flight, state: RowState, nowMs: number) {
  if (state === "landed") return flight.to;
  if (!flight.plan) return flight.from;
  return positionAt(flight.plan, flight.from, flight.to, nowMs);
}

export function FlightMapPreview({
  flight,
  state,
  nowMs,
  offsetMs,
}: {
  flight: Flight;
  state: RowState;
  nowMs: number;
  offsetMs: number;
}) {
  return (
    <MapView
      preview
      flightId={flight.id}
      from={flight.from}
      to={flight.to}
      plan={flight.plan ?? null}
      distanceMi={flight.distanceMi ?? flight.plan?.distanceMi ?? 0}
      bird={flight.bird}
      offsetMs={offsetMs}
      bottomPadding={0}
      night={!isDaylight(nowMs, birdAt(flight, state, nowMs))}
      loftLabel={flight.from.label}
      sillLabel={flight.to.label}
      loftAt={flight.kind === "return" ? "to" : "from"}
      state={POSE_STATE[state]}
    />
  );
}

export function JobMapPreview({
  map,
  bird,
  offsetMs,
}: {
  map: JobMap;
  bird: BirdLite;
  offsetMs: number;
}) {
  return (
    <MapView
      {...map}
      preview
      bird={bird}
      offsetMs={offsetMs}
      bottomPadding={0}
    />
  );
}
