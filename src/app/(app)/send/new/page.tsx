"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Loader } from "@/components/Loader";
import { useToast } from "@/components/Toasts";
import { snap, type Point } from "@/lib/game/privacy";
import {
  placeStart,
  searchPlaces,
  type PlaceResult,
} from "../../welcome/loft/roost";
import { pinKey } from "../write/guest";
import {
  keepResultsFor,
  savePin,
  searchFor,
  takePrefillName,
  type Picked,
  type Settled,
} from "./newRecipient";
import { NewRecipientView } from "./NewRecipientView";

const SEARCH_DELAY_MS = 300;

const noSubscribe = () => () => {};

function NewRecipient() {
  const toast = useToast();
  const [name, setName] = useState(() => takePrefillName(sessionStorage));
  const [query, setQuery] = useState("");
  const [settled, setSettled] = useState<Settled | null>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const latestPick = useRef<Picked | null>(null);

  const q = query.trim();
  const settledQuery = settled?.query;

  useEffect(() => {
    if (!q || q === settledQuery) return;
    let live = true;
    const timer = setTimeout(() => {
      void searchPlaces(q).then((r) => {
        if (!live) return;
        if (r.ok) {
          setSettled({ kind: "results", query: q, results: r.data.results });
        } else {
          setSettled({ kind: "failed", query: q });
          toast(r.message);
        }
      });
    }, SEARCH_DELAY_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [q, settledQuery, toast]);

  const onQuery = (next: string) => {
    setQuery(next);
    if (picked && next !== picked.label) setPicked(null);
  };

  const onPick = ({ placeId, label }: PlaceResult) => {
    const pick: Picked = { placeId, label, spot: null };
    latestPick.current = pick;
    setPicked(pick);
    setQuery(label);
    setSettled((s) => keepResultsFor(s, label));
    sessionStorage.removeItem(pinKey(placeId));
    void placeStart(placeId).then((r) => {
      if (latestPick.current !== pick) return;
      if (!r.ok) return toast(r.message);
      const { start } = r.data;
      setPicked((p) =>
        p === pick ? { ...pick, spot: { start, pin: start } } : p,
      );
    });
  };

  const onPin = ({ lat, lon }: Point) => {
    if (!picked?.spot) return;
    const spot = { ...picked.spot, pin: snap(lat, lon) };
    setPicked({ ...picked, spot });
    savePin(sessionStorage, picked.placeId, spot);
  };

  return (
    <NewRecipientView
      name={name}
      query={query}
      search={searchFor(query, settled)}
      picked={picked}
      onName={setName}
      onQuery={onQuery}
      onPick={onPick}
      onPin={onPin}
    />
  );
}

const useOnClient = () =>
  useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );

export default function NewRecipientPage() {
  return useOnClient() ? <NewRecipient /> : <Loader />;
}
