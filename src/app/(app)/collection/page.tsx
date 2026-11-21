"use client";

import { useEffect, useState } from "react";
import { loadCollection, openCollection } from "./collection";
import { CollectionView, type State } from "./CollectionView";

const SEEN_KEY = "coo.postmarks-seen";

function seenUpTo(): number | null {
  const stored = Number(localStorage.getItem(SEEN_KEY) ?? Number.NaN);
  return Number.isFinite(stored) ? stored : null;
}

export default function CollectionPage() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let live = true;
    void openCollection(
      loadCollection,
      seenUpTo(),
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    ).then((result) => {
      if (!live) return;
      if (!result.ok) {
        setState({ kind: "error", message: result.message });
        return;
      }
      localStorage.setItem(SEEN_KEY, String(result.postmarks.seen));
      setState({
        kind: "ready",
        postmarks: result.postmarks,
        badges: result.badges,
      });
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
