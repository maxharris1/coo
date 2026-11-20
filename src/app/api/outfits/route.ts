import { jsonRoute } from "@/server/http";
import { outfitsPut } from "./put";

export const PUT = outfitsPut(jsonRoute);
