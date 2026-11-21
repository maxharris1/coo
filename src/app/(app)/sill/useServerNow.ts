import { useEffect, useState } from "react";

const TICK_MS = 1000;

export function useServerNow(offsetMs: number): number {
  const [deviceNow, setDeviceNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setDeviceNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);
  return deviceNow + offsetMs;
}
