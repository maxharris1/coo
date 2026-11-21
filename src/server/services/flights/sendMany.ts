import { AppError } from "@/server/errors";
import type { SendHook } from "./send";

export const sendMany: SendHook = async () => {
  throw new AppError(
    "invalid",
    "sends: sending to more than one friend is not built yet",
  );
};
