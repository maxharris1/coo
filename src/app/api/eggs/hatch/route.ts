import { jsonRoute } from "@/server/http";
import { eggsHatchPost } from "./post";

export const POST = eggsHatchPost(jsonRoute);
