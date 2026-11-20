import { jsonRoute } from "@/server/http";
import { birdGearPut } from "./put";

export const PUT = birdGearPut(jsonRoute);
