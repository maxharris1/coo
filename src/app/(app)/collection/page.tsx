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
      if (result.ok) seen.write(result.account, result.view.postmarks.seen);
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
