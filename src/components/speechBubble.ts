export const BUBBLE = {
  showMs: 4000,
  minGapMs: 20000,
  maxGapMs: 40000,
  edgePx: 100,
} as const;

export type BubbleSide = "left" | "right";

export function bubbleSide({
  birdX,
  mapWidth,
  west,
}: {
  birdX: number;
  mapWidth: number;
  west: boolean;
}): BubbleSide {
  if (west) return birdX >= mapWidth - BUBBLE.edgePx ? "left" : "right";
  return birdX <= BUBBLE.edgePx ? "right" : "left";
}

export function startBubble({
  show,
  hide,
  dragging,
  random = Math.random,
}: {
  show: () => void;
  hide: () => void;
  dragging: () => boolean;
  random?: () => number;
}): () => void {
  let timer: ReturnType<typeof setTimeout>;
  const wait = () => {
    const gap =
      BUBBLE.minGapMs + random() * (BUBBLE.maxGapMs - BUBBLE.minGapMs);
    timer = setTimeout(due, gap);
  };
  const due = () => {
    if (dragging()) return wait();
    show();
    timer = setTimeout(() => {
      hide();
      wait();
    }, BUBBLE.showMs);
  };
  wait();
  return () => clearTimeout(timer);
}
