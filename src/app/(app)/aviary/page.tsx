"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/Toasts";
import { aviaryTop, loadAviary, type AviaryState } from "./aviary";
import { AviaryView } from "./AviaryView";

export default function AviaryPage() {
  const [state, setState] = useState<AviaryState>({ kind: "loading" });
  const toast = useToast();
  const live = useRef(true);

  const load = useCallback(() => {
    void loadAviary().then((r) => {
      if (!live.current) return;
      if (r.ok) {
        setState({ kind: "ready", top: aviaryTop(r.data) });
      } else {
        setState({ kind: "failed", message: r.message });
        toast(r.message);
      }
    });
  }, [toast]);

  useEffect(() => {
    live.current = true;
    load();
    return () => {
      live.current = false;
    };
  }, [load]);

  const onRetry = () => {
    setState({ kind: "loading" });
    load();
  };

  return <AviaryView state={state} onRetry={onRetry} />;
}
