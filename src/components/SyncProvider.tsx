"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { config } from "@/lib/config";
import { startSync, type SyncPayload } from "./sync";

export type SyncState = {
  data: SyncPayload | null;
  error: string | null;
  offsetMs: number;
  refresh: () => void;
};

type Snapshot = Omit<SyncState, "refresh">;

export const SyncContext = createContext<SyncState | null>(null);

export function SyncProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<Snapshot>({
    data: null,
    error: null,
    offsetMs: 0,
  });
  const handle = useRef<{ refresh(): void } | null>(null);

  useEffect(() => {
    const sync = startSync({
      fetch,
      win: window,
      doc: document,
      everyMs: config.game.sync.pollSeconds * 1000,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      onResult: (r) =>
        setSnapshot((old) =>
          r.ok
            ? { data: r.payload, error: null, offsetMs: r.offsetMs }
            : { ...old, error: r.message },
        ),
    });
    handle.current = sync;
    return sync.stop;
  }, []);

  const refresh = useCallback(() => handle.current?.refresh(), []);
  const value = useMemo(() => ({ ...snapshot, refresh }), [snapshot, refresh]);

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncState {
  const value = useContext(SyncContext);
  if (!value) throw new Error("useSync needs SyncProvider");
  return value;
}
