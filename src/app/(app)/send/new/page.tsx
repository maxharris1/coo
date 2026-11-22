"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Loader } from "@/components/Loader";
import { useToast } from "@/components/Toasts";
import { searchPlaces, type PlaceResult } from "../../welcome/loft/roost";
import {
  keepResultsFor,
  searchFor,
  takePrefillName,
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
  const [picked, setPicked] = useState<PlaceResult | null>(null);

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

  const onPick = (place: PlaceResult) => {
    setPicked(place);
    setQuery(place.label);
    setSettled((s) => keepResultsFor(s, place.label));
  };

  return (
    <NewRecipientView
      name={name}
      query={query}
      search={searchFor(query, settled)}
      pickedId={picked?.placeId ?? null}
      onName={setName}
      onQuery={onQuery}
      onPick={onPick}
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
