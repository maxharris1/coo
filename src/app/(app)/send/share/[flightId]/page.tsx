"use client";

import { useParams } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Loader } from "@/components/Loader";
import { useSync } from "@/components/SyncProvider";
import { useToast } from "@/components/Toasts";
import { fuzzyWhen, type Pronoun } from "@/lib/format";
import { FlightError } from "../../../flights/[id]/FlightError";
import { type FlightResult, loadFlight } from "../../../flights/[id]/flightApi";
import { takeLink } from "./linkHandoff";
import { shareMessage } from "./shareLink";
import { ShareLinkGone, ShareLinkView } from "./ShareLinkView";

const never = () => () => {};

function ShareLinkScreen({ flightId, url }: { flightId: string; url: string }) {
  const { data } = useSync();
  const toast = useToast();
  const [result, setResult] = useState<FlightResult | null>(null);
  const canShare = useSyncExternalStore(
    never,
    () => typeof navigator.share === "function",
    () => false,
  );

  useEffect(() => {
    let live = true;
    void loadFlight(fetch, flightId).then((r) => {
      if (live) setResult(r);
    });
    return () => {
      live = false;
    };
  }, [flightId]);

  if (result && !result.ok) return <FlightError code={result.code} />;
  if (!result || !data) return <Loader />;

  const { flight } = result;
  const bird = data.birds.find((b) => b.id === flight.bird.id);
  const pronoun = (bird?.pronoun as Pronoun | undefined) ?? "they";

  return (
    <ShareLinkView
      flightId={flight.id}
      bird={{ ...flight.bird, breed: bird?.breed }}
      pronoun={pronoun}
      guestName={flight.guestName ?? "your friend"}
      place={flight.to.label}
      lands={
        flight.arriveAt === undefined
          ? undefined
          : fuzzyWhen(
              flight.arriveAt,
              flight.releaseAt,
              data.me.timezone,
              "quote",
            )
      }
      url={url}
      canShare={canShare}
      onCopy={() =>
        navigator.clipboard.writeText(url).then(
          () => toast("Link copied"),
          () => toast("Couldn't copy. Press and hold the link instead."),
        )
      }
      onShare={() =>
        navigator.share({ text: shareMessage(url, pronoun) }).catch(() => {})
      }
    />
  );
}

export default function ShareLinkPage() {
  const { flightId } = useParams<{ flightId: string }>();
  const [url] = useState(() => takeLink(flightId));
  if (!url) return <ShareLinkGone flightId={flightId} />;
  return <ShareLinkScreen flightId={flightId} url={url} />;
}
