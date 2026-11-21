import type { ReactNode } from "react";
import type { Flight } from "@/server/services/flights/shape";

export const TrackerDelay: (props: {
  flight: Flight;
  nowMs: number;
}) => ReactNode = () => null;
