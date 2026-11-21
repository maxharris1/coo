import { AppError } from "@/server/errors";
import type { SendHook } from "./send";

export const guestSend: SendHook = async () => {
  throw new AppError("invalid", "sends.guest: guest sends are not built yet");
};
