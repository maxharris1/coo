import { jsonRoute } from "@/server/http";
import { flightGet } from "./get";

export const GET = flightGet(jsonRoute);
