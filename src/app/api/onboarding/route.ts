import { handler } from "@/server/handler";
import { headersJar } from "@/server/supabase/cookies";
import { onboardingPost } from "./post";

export const POST = onboardingPost(handler, () => headersJar());
