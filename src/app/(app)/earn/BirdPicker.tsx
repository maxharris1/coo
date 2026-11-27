"use client";

import { useCallback, useEffect, useId, useRef } from "react";
import { flushSync } from "react-dom";
import { Bird, type GearId, type Look } from "@/components/Bird";
import type { SyncPayload } from "@/components/sync";
import { sameBirdName } from "@/lib/birdName";
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

const describe = (bird: PickableBird): string => {
  const worn = bird.gear.flatMap((id) => GEAR_NAMES.get(id) ?? []);
  const label = `${bird.name}, looks like ${lookName(bird.look as Look)}`;
  return worn.length ? `${label}, wearing ${AND.format(worn)}` : label;
};

export const rowLabels = (birds: PickableBird[]): (string | undefined)[] => {
  const labels: (string | undefined)[] = birds.map(() => undefined);
  const spoken = birds.map((b) => b.name);
  for (;;) {
    const clashes = spoken
      .map((name) =>
        spoken.flatMap((other, j) => (sameBirdName(other, name) ? [j] : [])),
      )
      .filter((group, i) => group.length > 1 && group[0] === i);
    if (!clashes.length) return labels;
    for (const group of clashes) {
      group.forEach((i, k) => {
        labels[i] =
          `${labels[i] ?? describe(birds[i])}, ${k + 1} of ${group.length}`;
        spoken[i] = labels[i];
      });
    }
  }
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
  const labels = rowLabels(birds);

  const close = useCallback(() => {
    flushSync(onClose);
    opener?.focus();
  }, [onClose, opener]);

  useEffect(() => {
    if (!dialog.current?.contains(document.activeElement)) {
      dialog.current?.focus();
    }
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (e.key === "Tab") {
        e.preventDefault();
        const items = [
          ...(dialog.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []),
        ];
        const at = items.indexOf(document.activeElement as HTMLElement);
        items
          .at(e.shiftKey ? Math.max(at, 0) - 1 : (at + 1) % items.length)
          ?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);

  return (
    <div className={styles.layer}>
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        className={styles.scrim}
        onMouseDown={(e) => e.preventDefault()}
        onClick={close}
      />
      <div
        ref={dialog}
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
          {birds.map((bird, i) => (
            <li key={bird.id}>
              <button
                type="button"
                aria-label={labels[i]}
                className={styles.row}
                onClick={() => onChoose(bird.id)}
              >
                <span className={styles.avatar}>
                  <Bird
                    look={bird.look as Look}
                    gear={bird.gear as GearId[]}
                    animated={false}
                    size={42}
                  />
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
