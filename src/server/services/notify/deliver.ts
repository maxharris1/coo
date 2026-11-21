import type { Deps } from "@/server/deps";

export const deliver: (
  deps: Deps,
  notificationId: string,
) => Promise<{ pushed: false }> = async () => ({ pushed: false });
