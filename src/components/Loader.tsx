"use client";

import { useEffect, useState } from "react";
import { Bird } from "./Bird";
import styles from "./Loader.module.css";

export const LOADER_DELAY_MS = 400;

export function afterDelay(show: () => void): () => void {
  const timer = setTimeout(show, LOADER_DELAY_MS);
  return () => clearTimeout(timer);
}

export function LoaderView({ shown }: { shown: boolean }) {
  return (
    <div className={styles.page} aria-busy="true">
      {shown && (
        <div role="status" className={styles.status}>
          <div className={styles.walk}>
            <Bird look="gerald" size={96} />
          </div>
          <span className={styles.label}>Loading</span>
        </div>
      )}
    </div>
  );
}

export function Loader() {
  const [shown, setShown] = useState(false);
  useEffect(() => afterDelay(() => setShown(true)), []);
  return <LoaderView shown={shown} />;
}
