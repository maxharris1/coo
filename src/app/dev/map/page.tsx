import type { Metadata } from "next";
import { DevFlight } from "./DevFlight";
import { DevMap } from "./DevMap";
import { parseFake } from "./fakeFlight";
import {
  MODES,
  MODE_LABELS,
  PLACES,
  ZOOMS,
  parseView,
  viewHref,
} from "./views";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Map" };

export default async function DevMapPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  // ?flight=1 shows the real tracker (map, header and bottom card) on a fixed
  // fake flight, so the map, its labels and its credit can be checked against
  // the card without the API. ?night=1 forces night, ?progress=0..1 moves the
  // bird, ?preview=1 shows the flights-list preview instead. It lives here
  // rather than at its own route so it stays a public dev page.
  if (params.flight === "1") return <DevFlight params={parseFake(params)} />;
  const view = parseView(params);
  const { place, zoom, mode } = view;
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Map</h1>
      <nav aria-label="Places" className={styles.links}>
        {PLACES.map((p) => (
          <a
            key={p.id}
            href={viewHref({ ...view, place: p })}
            aria-current={p.id === place.id ? "true" : undefined}
            className={styles.link}
          >
            {p.label}
          </a>
        ))}
      </nav>
      <nav aria-label="Zooms" className={styles.links}>
        {ZOOMS.map((z) => (
          <a
            key={z}
            href={viewHref({ ...view, zoom: z })}
            aria-current={z === zoom ? "true" : undefined}
            className={styles.link}
          >
            {z}
          </a>
        ))}
      </nav>
      <nav aria-label="Modes" className={styles.links}>
        {MODES.map((m) => (
          <a
            key={m}
            href={viewHref({ ...view, mode: m })}
            aria-current={m === mode ? "true" : undefined}
            className={styles.link}
          >
            {MODE_LABELS[m]}
          </a>
        ))}
      </nav>
      <DevMap {...view} />
    </main>
  );
}
