"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";
import emptyStates from "../../assets/copy/empty-states.json";
import styles from "./OfflineBanner.module.css";

const OFFLINE_LINE = emptyStates.find((s) => s.state === "Offline")!.text;

export const onlineStore = {
  subscribe(onChange: () => void) {
    window.addEventListener("online", onChange);
    window.addEventListener("offline", onChange);
    return () => {
      window.removeEventListener("online", onChange);
      window.removeEventListener("offline", onChange);
    };
  },
  getSnapshot: () => navigator.onLine,
  getServerSnapshot: () => true,
};

export const BANNER_HEIGHT_VAR = "--coo-offline-banner";

export function OfflineLine() {
  const line = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const el = line.current;
    if (!el) return;
    const body = document.body.style;
    const publish = () =>
      body.setProperty(
        BANNER_HEIGHT_VAR,
        `${el.getBoundingClientRect().height}px`,
      );
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => {
      observer.disconnect();
      body.removeProperty(BANNER_HEIGHT_VAR);
    };
  }, []);

  return (
    <p ref={line} role="status" className={styles.line}>
      {OFFLINE_LINE}
    </p>
  );
}

export function OfflineBanner() {
  const online = useSyncExternalStore(
    onlineStore.subscribe,
    onlineStore.getSnapshot,
    onlineStore.getServerSnapshot,
  );
  const path = usePathname();
  if (online || path === "/offline") return null;
  return <OfflineLine />;
}
