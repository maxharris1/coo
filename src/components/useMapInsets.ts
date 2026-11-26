"use client";

import { useEffect, useRef, useState } from "react";

/** Room above a pin's point: the 40 px pin and its label, plus a margin. */
export const PIN_ROOM_PX = 52;

export type MapInsets = { top: number; bottom: number };
type Box = { offsetTop: number; offsetHeight: number };

/**
 * How much of the map the screen's chrome covers: the bottom card's height,
 * and the header's bottom edge plus room for a pin under it.
 */
export function insetsOf(card: Box, header: Box | null, fallback: MapInsets) {
  return {
    top: header
      ? Math.round(header.offsetTop + header.offsetHeight + PIN_ROOM_PX)
      : fallback.top,
    bottom: Math.round(card.offsetHeight) || fallback.bottom,
  };
}

/**
 * Measures the card over the bottom of a map (and the header over its top)
 * and keeps the result current as they resize, so the camera, the bird, the
 * pins and the map credit stay clear of them. Until the first measurement it
 * answers `fallback`.
 */
export function useMapInsets(fallback: MapInsets) {
  const cardRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const [insets, setInsets] = useState(fallback);
  const { top, bottom } = fallback;

  useEffect(() => {
    const card = cardRef.current;
    if (!card || typeof ResizeObserver === "undefined") return;
    const header = headerRef.current;
    const observer = new ResizeObserver(() => {
      const next = insetsOf(card, header, { top, bottom });
      setInsets((prev) =>
        prev.top === next.top && prev.bottom === next.bottom ? prev : next,
      );
    });
    observer.observe(card);
    if (header) observer.observe(header);
    return () => observer.disconnect();
  }, [top, bottom]);

  return { cardRef, headerRef, insets };
}
