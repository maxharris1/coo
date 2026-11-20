import { jsonRoute } from "@/server/http";
import { geoHereGet } from "./get";

export const GET = geoHereGet(jsonRoute);
