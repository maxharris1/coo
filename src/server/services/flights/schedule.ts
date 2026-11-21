import { AppError } from "@/server/errors";
import type { SendHook } from "./send";

export const schedule: SendHook = async () => {
  throw new AppError("invalid", "releaseAt: scheduling is not built yet");
};
