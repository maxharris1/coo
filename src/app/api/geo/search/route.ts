import { jsonRoute } from "@/server/http";
import { geoSearchGet } from "./get";

export const GET = geoSearchGet(jsonRoute);
