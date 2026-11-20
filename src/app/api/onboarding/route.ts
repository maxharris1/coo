import { jsonRoute } from "@/server/http";
import { onboardingPost } from "./post";

export const POST = onboardingPost(jsonRoute);
