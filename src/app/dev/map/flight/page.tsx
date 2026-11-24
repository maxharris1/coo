import type { Metadata } from "next";
import { DevFlight } from "./DevFlight";
import { parseFake } from "./fakeFlight";

export const metadata: Metadata = { title: "Flight map" };

// The real tracker (map, header and bottom card) on a fixed fake flight, so
// the map, its labels and its credit can be checked against the card without
// the API. ?night=1 forces night, ?progress=0..1 moves the bird, ?preview=1
// shows the flights-list preview instead.
export default async function DevFlightMapPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <DevFlight params={parseFake(await searchParams)} />;
}
