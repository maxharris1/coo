"use client";

import { type KeyboardEvent, useCallback, useId, useRef } from "react";
import { flushSync } from "react-dom";
import { Bird, type GearId, type Look } from "@/components/Bird";
import type { SyncPayload } from "@/components/sync";
import { config } from "@/lib/config";
import { lookName } from "../aviary/roommate/roommate";
import styles from "./BirdPicker.module.css";

export type PickableBird = Pick<
  SyncPayload["birds"][number],
  "id" | "name" | "look" | "gear"
>;

const FOCUSABLE = "button, a[href], [tabindex]:not([tabindex='-1'])";
const GEAR_NAMES = new Map(config.gear.items.map((g) => [g.id, g.name]));
const AND = new Intl.ListFormat("en", { type: "conjunction" });

export const rowLabel = (
  bird: PickableBird,
  all: PickableBird[],
): string | undefined => {
  if (!all.some((b) => b.id !== bird.id && b.name === bird.name)) return;
  const worn = bird.gear.flatMap((id) => GEAR_NAMES.get(id) ?? []);
  const label = `${bird.name}, looks like ${lookName(bird.look as Look)}`;
  return worn.length ? `${label}, wearing ${AND.format(worn)}` : label;
};

export function BirdPicker({
  birds,
  opener,
  onChoose,
  onClose,
}: {
  birds: PickableBird[];
  opener: HTMLElement | null;
  onChoose: (birdId: string) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const mountDialog = useCallback((el: HTMLDivElement | null) => {
    dialog.current = el;
    el?.focus();
  }, []);

  const close = () => {
    flushSync(onClose);
    opener?.focus();
  };

  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") {
      e.preventDefault();
      const items = [
        ...(dialog.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []),
      ];
      const at = items.indexOf(e.target as HTMLElement);
      items
        .at(e.shiftKey ? Math.max(at, 0) - 1 : (at + 1) % items.length)
        ?.focus();
    }
  };

  return (
    <div className={styles.layer} onKeyDown={onKey}>
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        className={styles.scrim}
        onMouseDown={(e) => e.preventDefault()}
        onClick={close}
      />
      <div
        ref={mountDialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={styles.sheet}
      >
        <span aria-hidden="true" className={styles.grab} />
        <h2 id={titleId} className={styles.title}>
          Who goes?
        </h2>
        <ul className={styles.rows}>
          {birds.map((bird) => (
            <li key={bird.id}>
              <button
                type="button"
                aria-label={rowLabel(bird, birds)}
                className={styles.row}
                onClick={() => onChoose(bird.id)}
              >
                <span className={styles.avatar}>
                  <span className={styles.avatarBird}>
                    <Bird
                      look={bird.look as Look}
                      gear={bird.gear as GearId[]}
                      animated={false}
                      size={86}
                    />
                  </span>
                </span>
                <span className={styles.name}>{bird.name}</span>
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className={styles.close} onClick={close}>
          Close
        </button>
      </div>
    </div>
  );
}
