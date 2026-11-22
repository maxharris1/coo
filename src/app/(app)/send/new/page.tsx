"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Loader } from "@/components/Loader";
import { useToast } from "@/components/Toasts";
import { snap, type Point } from "@/lib/game/privacy";
import {
  lookHere,
  placeStart,
  searchPlaces,
  type PlaceResult,
} from "../../welcome/loft/roost";
import { writePin } from "../write/guest";
import { PLACE_NOT_FOUND } from "./NewRecipientView";
import {
  keepResultsFor,
  searchFor,
  takePrefillName,
  type Settled,
} from "./newRecipient";
import { NewRecipientView, type Destination } from "./NewRecipientView";

const SEARCH_DELAY_MS = 300;

const noSubscribe = () => () => {};

function NewRecipient() {
  const toast = useToast();
  const [name, setName] = useState(() => takePrefillName(sessionStorage));
  const [query, setQuery] = useState("");
  const [settled, setSettled] = useState<Settled | null>(null);
  const [picked, setPicked] = useState<PlaceResult | null>(null);
  const [destination, setDestination] = useState<Destination | null>(null);
  const [settling, setSettling] = useState(false);
  const latest = useRef(0);

  const choose = (place: PlaceResult | null) => {
    latest.current += 1;
    setPicked(place);
    setDestination(null);
    setSettling(false);
  };

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
    if (picked && next !== picked.label) choose(null);
  };

  const onPick = (place: PlaceResult) => {
    choose(place);
    setQuery(place.label);
    setSettled((s) => keepResultsFor(s, place.label));
    writePin(sessionStorage, place.placeId, null);
    const mine = latest.current;
    void placeStart(place.placeId).then((r) => {
      if (latest.current !== mine) return;
      if (!r.ok) return toast(r.message);
      setDestination({ at: r.data.start, label: place.label });
    });
  };

  const onMove = (point: Point) => {
    if (!picked) return;
    const { placeId } = picked;
    const mine = ++latest.current;
    setSettling(true);
    void lookHere(snap(point.lat, point.lon)).then((r) => {
      if (latest.current !== mine) return;
      setSettling(false);
      if (!r.ok) return toast(r.message);
      const { place, message } = r.data;
      if (!place) return toast(message ?? PLACE_NOT_FOUND);
      writePin(sessionStorage, placeId, point);
      setDestination({ at: point, label: place.label });
    });
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
      destination={destination}
      onMove={onMove}
      settling={settling}
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
