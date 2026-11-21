import type { Metadata } from "next";
import { DevMap } from "./DevMap";
import { PLACES, ZOOMS, parseView, viewHref } from "./views";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Map" };

export default async function DevMapPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { place, zoom } = parseView(await searchParams);
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Map</h1>
      <nav aria-label="Places" className={styles.links}>
        {PLACES.map((p) => (
          <a
            key={p.id}
            href={viewHref({ place: p, zoom })}
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
            href={viewHref({ place, zoom: z })}
            aria-current={z === zoom ? "true" : undefined}
            className={styles.link}
          >
            {z}
          </a>
        ))}
      </nav>
      <DevMap place={place} zoom={zoom} />
    </main>
  );
}
