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

export const rowLabel = (
  bird: PickableBird,
  all: PickableBird[],
): string | undefined => {
  const named = all.filter((b) => sameBirdName(b.name, bird.name));
  if (named.length < 2) return;
  const kit = (b: PickableBird) => `${b.look}|${[...b.gear].sort()}`;
  const twins = named.filter((b) => kit(b) === kit(bird));
  const worn = bird.gear.flatMap((id) => GEAR_NAMES.get(id) ?? []);
  let label = `${bird.name}, looks like ${lookName(bird.look as Look)}`;
  if (worn.length) label += `, wearing ${AND.format(worn)}`;
  if (twins.length < 2) return label;
  return `${label}, ${twins.indexOf(bird) + 1} of ${twins.length}`;
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
          {birds.map((bird) => (
            <li key={bird.id}>
              <button
                type="button"
                aria-label={rowLabel(bird, birds)}
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
