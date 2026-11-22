"use client";

import { useEffect, useEffectEvent, useReducer, useRef, useState } from "react";
import { config } from "@/lib/config";
import { DOODLE_COLORS, DOODLE_WIDTHS, type Doodle } from "@/lib/game/notes";
import { DoodleStrokes } from "./DoodleView";
import styles from "./DoodlePad.module.css";
import {
  type DoodleWidth,
  type DraftAction,
  type Point,
  EMPTY_DRAFT,
  draftReducer,
  toDoodle,
} from "./draft";

const limits = config.game.notes.doodle;

type PadPointerEvent = {
  pointerId: number;
  clientX: number;
  clientY: number;
  currentTarget: {
    setPointerCapture(pointerId: number): void;
    getBoundingClientRect(): {
      left: number;
      top: number;
      width: number;
      height: number;
    };
  };
  preventDefault(): void;
};

export function padPointer(send: (action: DraftAction) => void) {
  let active: number | null = null;
  const at = ({ clientX, clientY, currentTarget }: PadPointerEvent): Point => {
    const box = currentTarget.getBoundingClientRect();
    return [
      ((clientX - box.left) / box.width) * limits.width,
      ((clientY - box.top) / box.height) * limits.height,
    ];
  };
  return {
    onPointerDown(event: PadPointerEvent) {
      if (active !== null) return;
      active = event.pointerId;
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
      send({ type: "down", point: at(event) });
    },
    onPointerMove(event: PadPointerEvent) {
      if (event.pointerId !== active) return;
      event.preventDefault();
      send({ type: "move", point: at(event) });
    },
    onPointerUp(event: PadPointerEvent) {
      if (event.pointerId !== active) return;
      active = null;
      send({ type: "up" });
    },
    onPointerCancel(event: PadPointerEvent) {
      if (event.pointerId !== active) return;
      active = null;
      send({ type: "cancel" });
    },
    isDown: () => active !== null,
  };
}

export function holdScroll(
  target: EventTarget,
  isDrawing: () => boolean,
): () => void {
  const hold = (event: Event) => {
    if (isDrawing()) event.preventDefault();
  };
  target.addEventListener("touchmove", hold, { passive: false });
  return () => target.removeEventListener("touchmove", hold);
}

const WIDTH_LABEL: Record<DoodleWidth, string> = {
  fine: "Fine tip",
  marker: "Marker",
};

const capitalise = (s: string) => s[0].toUpperCase() + s.slice(1);

export function DoodlePad({
  onChange,
}: {
  onChange: (doodle: Doodle | null) => void;
}) {
  const [draft, dispatch] = useReducer(draftReducer, EMPTY_DRAFT);
  const [pointer] = useState(() => padPointer(dispatch));
  const surface = useRef<SVGSVGElement>(null);

  const publish = useEffectEvent(() => onChange(toDoodle(draft)));
  useEffect(() => publish(), [draft.strokes]);
  useEffect(() => holdScroll(surface.current!, pointer.isDown), [pointer]);

  const { strokes, active } = draft;
  const empty = strokes.length === 0;

  return (
    <div role="group" aria-label="Doodle pad" className={styles.pad}>
      <svg
        ref={surface}
        className={styles.surface}
        viewBox={`0 0 ${limits.width} ${limits.height}`}
        aria-hidden="true"
        onPointerDown={pointer.onPointerDown}
        onPointerMove={pointer.onPointerMove}
        onPointerUp={pointer.onPointerUp}
        onPointerCancel={pointer.onPointerCancel}
      >
        <DoodleStrokes strokes={active ? [...strokes, active] : strokes} />
      </svg>
      <div className={styles.tools}>
        {DOODLE_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={capitalise(color)}
            aria-pressed={draft.color === color}
            className={`${styles.button} ${styles.swatch}`}
            style={{ background: `var(--coo-${color})` }}
            onClick={() => dispatch({ type: "color", color })}
          />
        ))}
        {DOODLE_WIDTHS.map((width) => (
          <button
            key={width}
            type="button"
            aria-label={WIDTH_LABEL[width]}
            aria-pressed={draft.width === width}
            className={styles.button}
            onClick={() => dispatch({ type: "width", width })}
          >
            <svg viewBox="0 0 24 24" className={styles.nib} aria-hidden="true">
              <DoodleStrokes
                strokes={[{ color: draft.color, width, points: [[12, 12]] }]}
              />
            </svg>
          </button>
        ))}
        <button
          type="button"
          aria-label="Undo last stroke"
          className={styles.button}
          disabled={empty}
          onClick={() => dispatch({ type: "undo" })}
        >
          Undo
        </button>
        <button
          type="button"
          aria-label="Clear doodle"
          className={styles.button}
          disabled={empty && !active}
          onClick={() => dispatch({ type: "clear" })}
        >
          Clear
        </button>
      </div>
    </div>
  );
}
