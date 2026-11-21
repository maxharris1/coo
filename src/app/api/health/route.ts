import { jsonRoute } from "@/server/http";
import { healthGet } from "./get";

export const GET = healthGet(jsonRoute);
