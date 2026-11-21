import { jsonRoute } from "@/server/http";
import { quotePost } from "./post";

export const POST = quotePost(jsonRoute);
