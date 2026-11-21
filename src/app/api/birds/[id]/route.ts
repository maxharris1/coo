import { jsonRoute } from "@/server/http";
import { birdPatch } from "./patch";

export const PATCH = birdPatch(jsonRoute);
