import { useCallback, useId, useRef, type KeyboardEvent } from "react";
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
  const dialog = useRef<HTMLDivElement | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const mountDialog = useCallback((el: HTMLDivElement | null) => {
    dialog.current = el;
    if (el) {
      opener.current = document.activeElement as HTMLElement | null;
      el.focus();
    } else {
      opener.current?.focus();
    }
  }, []);

  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
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
        onClick={onClose}
        onFocus={() => dialog.current?.focus()}
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
