import { useCallback, useId, useLayoutEffect, useRef } from "react";
import { config } from "@/lib/config";
import styles from "./EspressoSheet.module.css";

const SHOT = config.game.consumables.find((c) => c.id === "espresso");
if (!SHOT) throw new Error("config/game.json has no espresso consumable");
const { name, effect, price } = SHOT;

const FOCUSABLE = "button, a[href], [tabindex]:not([tabindex='-1'])";

export function EspressoSheet({
  held,
  onClose,
}: {
  held: number;
  onClose: () => void;
}) {
  const titleId = useId();
  const close = useRef(onClose);
  useLayoutEffect(() => {
    close.current = onClose;
  });
  const mountDialog = useCallback((el: HTMLDivElement) => {
    const opener = document.activeElement as HTMLElement | null;
    el.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close.current();
      } else if (e.key === "Tab") {
        e.preventDefault();
        const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)];
        const at = items.indexOf(e.target as HTMLElement);
        items
          .at(e.shiftKey ? Math.max(at, 0) - 1 : (at + 1) % items.length)
          ?.focus();
      }
    };
    const onFocusIn = (e: FocusEvent) => {
      if (!el.contains(e.target as Node)) el.focus();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("focusin", onFocusIn);
      opener?.focus();
    };
  }, []);

  return (
    <div className={styles.layer}>
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        className={styles.scrim}
        onClick={onClose}
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
          {name}
        </h2>
        <p className={styles.line}>{effect}</p>
        <p className={styles.price}>{`${price} seeds`}</p>
        <p className={styles.line}>
          {`You hold ${held} ${held === 1 ? "shot" : "shots"}`}
        </p>
        <button type="button" className={styles.close} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
