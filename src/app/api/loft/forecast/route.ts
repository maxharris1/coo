import { jsonRoute } from "@/server/http";
import { loftForecastGet } from "./get";

export const GET = loftForecastGet(jsonRoute);
