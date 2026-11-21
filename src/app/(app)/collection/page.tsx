"use client";

import { useEffect, useState } from "react";
import { loadCollection, openCollection } from "./collection";
import { CollectionView, type State } from "./CollectionView";

export default function CollectionPage() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let live = true;
    void openCollection(loadCollection).then((result) => {
      if (!live) return;
      setState(
        result.ok
          ? { kind: "ready", ...result.view }
          : { kind: "error", message: result.message },
      );
    });
    return () => {
      live = false;
    };
  }, [attempt]);

  return (
    <CollectionView
      state={state}
      onRetry={() => {
        setState({ kind: "loading" });
        setAttempt((n) => n + 1);
      }}
    />
  );
}
