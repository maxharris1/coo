import { jsonRoute } from "@/server/http";
import { jobGet } from "./get";

export const GET = jobGet(jsonRoute);
