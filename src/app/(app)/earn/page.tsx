"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/Toasts";
import { earnTop, loadEarn, type EarnState } from "./earn";
import { EarnView } from "./EarnView";

export default function EarnPage() {
  const [state, setState] = useState<EarnState>({ kind: "loading" });
  const toast = useToast();
  const live = useRef(true);

  const load = useCallback(() => {
    void loadEarn().then((r) => {
      if (!live.current) return;
      if (r.ok) {
        setState({
          kind: "ready",
          top: earnTop(r.data),
          jobs: r.data.jobs,
          found: r.data.found,
        });
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

  return <EarnView state={state} onRetry={onRetry} onChanged={load} />;
}
