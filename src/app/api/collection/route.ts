import { jsonRoute } from "@/server/http";
import { collectionGet } from "./get";

export const GET = collectionGet(jsonRoute);
