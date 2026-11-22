import { jsonRoute } from "@/server/http";
import { geoPlaceGet } from "./get";

export const GET = geoPlaceGet(jsonRoute);
