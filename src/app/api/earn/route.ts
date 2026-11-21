import { jsonRoute } from "@/server/http";
import { earnGet } from "./get";

export const GET = earnGet(jsonRoute);
