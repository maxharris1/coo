import { useEffect, useState } from "react";

const TICK_MS = 1000;

type Anchor = { offsetMs: number; serverMs: number; monoMs: number };

function anchorAt(offsetMs: number): Anchor {
  return {
    offsetMs,
    serverMs: Date.now() + offsetMs,
    monoMs: performance.now(),
  };
}

export function useServerNow(offsetMs: number): number {
  const [anchor, setAnchor] = useState(() => anchorAt(offsetMs));
  const [monoNow, setMonoNow] = useState(anchor.monoMs);

  if (anchor.offsetMs !== offsetMs) {
    const next = anchorAt(offsetMs);
    setAnchor(next);
    setMonoNow(next.monoMs);
  }

  useEffect(() => {
    const timer = setInterval(() => setMonoNow(performance.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  return anchor.serverMs + (monoNow - anchor.monoMs);
}
