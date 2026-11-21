import { jsonRoute } from "@/server/http";
import { devGrantPost } from "./post";

export const POST = devGrantPost(jsonRoute);
