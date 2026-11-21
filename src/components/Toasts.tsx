"use client";

import {
  createContext,
  useContext,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useSync } from "./SyncProvider";
import { createToasts } from "./toastStore";
import styles from "./Toasts.module.css";

const TOAST_MS = 4000;

export const ToastContext = createContext<((message: string) => void) | null>(
  null,
);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => createToasts(TOAST_MS));
  const shown = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  const { error } = useSync();
  const messages = [
    ...(error ? [{ key: "sync", message: error }] : []),
    ...shown.map((t) => ({ key: String(t.id), message: t.message })),
  ];

  return (
    <ToastContext.Provider value={store.show}>
      {children}
      <div role="status" aria-live="polite" className={styles.stack}>
        {messages.map((t) => (
          <p key={t.key} className={styles.toast}>
            {t.message}
          </p>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): (message: string) => void {
  const show = useContext(ToastContext);
  if (!show) throw new Error("useToast needs ToastProvider");
  return show;
}
