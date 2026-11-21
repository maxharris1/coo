"use client";

import { useEffect, useState } from "react";
import { loadCollection, openCollection, seenStore } from "./collection";
import { CollectionView, type State } from "./CollectionView";

const seen = seenStore(() => localStorage);

export default function CollectionPage() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let live = true;
    void openCollection(
      loadCollection,
      seen.read,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    ).then((result) => {
      if (!live) return;
      if (!result.ok) {
        setState({ kind: "error", message: result.message });
        return;
      }
      seen.write(result.account, result.postmarks.seen);
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
