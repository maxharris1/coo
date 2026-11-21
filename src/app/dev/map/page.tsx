import type { Metadata } from "next";
import { DevMap } from "./DevMap";
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
  const view = parseView(await searchParams);
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
