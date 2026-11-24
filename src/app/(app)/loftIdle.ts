export type Reach = { lift: number; sink: number };

type GestureSpec = {
  keyframes: string;
  ms: number;
  easing: string;
  reach: Reach;
};

export const GESTURES = {
  hop: {
    keyframes: "coo-loft-hop",
    ms: 900,
    easing: "ease-in-out",
    reach: { lift: 16, sink: 2 },
  },
  preen: {
    keyframes: "coo-loft-preen",
    ms: 1400,
    easing: "ease-in-out",
    reach: { lift: 0, sink: 1 },
  },
  ruffle: {
    keyframes: "coo-loft-ruffle",
    ms: 800,
    easing: "ease-in-out",
    reach: { lift: 5, sink: 0 },
  },
  look: {
    keyframes: "coo-loft-look",
    ms: 1600,
    easing: "steps(1, end)",
    reach: { lift: 0, sink: 0 },
  },
  stretch: {
    keyframes: "coo-loft-stretch",
    ms: 1200,
    easing: "ease-in-out",
    reach: { lift: 12, sink: 0 },
  },
  coo: {
    keyframes: "coo-loft-coo",
    ms: 1000,
    easing: "ease-in-out",
    reach: { lift: 4, sink: 2 },
  },
} as const satisfies Record<string, GestureSpec>;

export type Gesture = keyof typeof GESTURES;
export const GESTURE_NAMES = Object.keys(GESTURES) as Gesture[];
export const REST_MS = { min: 4000, max: 12000 };

export const gestureAnimation = (g: Gesture) =>
  `${GESTURES[g].keyframes} ${GESTURES[g].ms}ms ${GESTURES[g].easing} 1 both`;

export const maxIdleReach = (): Reach =>
  Object.values(GESTURES).reduce<Reach>(
    (m, { reach }) => ({
      lift: Math.max(m.lift, reach.lift),
      sink: Math.max(m.sink, reach.sink),
    }),
    { lift: 0, sink: 0 },
  );

const stagger = (id: string) =>
  ([...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 1000) / 1000;

type VisibilityDoc = Pick<
  Document,
  "hidden" | "addEventListener" | "removeEventListener"
>;

export type LoftIdleOptions = {
  birdIds: readonly string[];
  reducedMotion: boolean;
  doc: VisibilityDoc;
  random?: () => number;
  onGesture: (id: string, gesture: Gesture | null) => void;
  onPause: (paused: boolean) => void;
};

export function startLoftIdle({
  birdIds,
  reducedMotion,
  doc,
  random = Math.random,
  onGesture,
  onPause,
}: LoftIdleOptions): () => void {
  if (reducedMotion) return () => {};
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const rest = () => REST_MS.min + random() * (REST_MS.max - REST_MS.min);
  const later = (id: string, ms: number, run: () => void) =>
    timers.set(id, setTimeout(run, ms));

  const play = (id: string) => {
    const gesture = GESTURE_NAMES[Math.floor(random() * GESTURE_NAMES.length)];
    onGesture(id, gesture);
    later(id, GESTURES[gesture].ms, () => {
      onGesture(id, null);
      later(id, rest(), () => play(id));
    });
  };

  const halt = () => {
    for (const t of timers.values()) clearTimeout(t);
    timers.clear();
  };

  const resume = () => {
    halt();
    for (const id of birdIds) {
      later(id, stagger(id) * REST_MS.min + rest(), () => play(id));
    }
  };

  const onVisibility = () => {
    if (doc.hidden) {
      halt();
      for (const id of birdIds) onGesture(id, null);
      onPause(true);
    } else {
      onPause(false);
      resume();
    }
  };

  doc.addEventListener("visibilitychange", onVisibility);
  onVisibility();

  return () => {
    halt();
    doc.removeEventListener("visibilitychange", onVisibility);
  };
}
