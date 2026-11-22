import { useEffect, useState } from "react";
import type { SyncPayload } from "@/components/sync";

const TICK_MS = 1000;

type ServerSample = Pick<SyncPayload, "serverNow" | "serverNowMono">;

export function useServerNow(sample: ServerSample | null): number | null {
  const [monoNow, setMonoNow] = useState(() => performance.now());

  useEffect(() => {
    const timer = setInterval(() => setMonoNow(performance.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  return sample && sample.serverNow + (monoNow - sample.serverNowMono);
}
