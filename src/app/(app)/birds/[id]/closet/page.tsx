"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useRef, useState } from "react";
import { Bird, type GearId, type Look } from "@/components/Bird";
import { Loader } from "@/components/Loader";
import { useSync } from "@/components/SyncProvider";
import { useToast } from "@/components/Toasts";
import type { Pronoun } from "@/lib/format";
import { ClosetTile } from "./ClosetTile";
import {
  applyOutfit,
  closetCells,
  effectsFor,
  pick,
  skippedNote,
  type Cell,
  type Wardrobe,
} from "./closet";
import styles from "./page.module.css";
import { WeatherTip } from "./WeatherTip";
import { putGear, type GearBody } from "./wear";

function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} aria-label={label} className={styles.back}>
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M15 5 L8 12 L15 19"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </Link>
  );
}

type Worn = { birdId: string; worn: GearId[] };

type Saves = {
  pending: (Worn & { done: Promise<void> }) | null;
  confirmed: (Worn & { savedAt: number }) | null;
};

const byShelf = (cells: Cell[]) => [
  ...cells.filter((c) => c.kind !== "store"),
  ...cells.filter((c) => c.kind === "store"),
];

export default function ClosetPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, offsetMs, refresh } = useSync();
  const toast = useToast();
  const [saves, setSaves] = useState<Saves>({
    pending: null,
    confirmed: null,
  });
  const latest = useRef(saves);
  if (!data) {
    if (!error) return <Loader />;
    return (
      <main className={styles.screen}>
        <BackLink href="/" label="Back to the loft" />
        <p role="alert">{error}</p>
        <button type="button" className={styles.retry} onClick={refresh}>
          Try again
        </button>
      </main>
    );
  }

  const bird = data.birds.find((b) => b.id === id);
  if (!bird) {
    return (
      <main className={styles.screen}>
        <BackLink href="/" label="Back to the loft" />
        <p>Could not find that bird.</p>
      </main>
    );
  }

  const fetchedAt = data.serverNow - offsetMs;
  const wornIn = ({ pending, confirmed }: Saves) =>
    (pending?.birdId === bird.id ? pending.worn : null) ??
    (confirmed?.birdId === bird.id && fetchedAt <= confirmed.savedAt
      ? confirmed.worn
      : null) ??
    (bird.gear as GearId[]);
  const worn = wornIn(saves);
  const wardrobeFor = (gear: GearId[]): Wardrobe => ({
    bird: { ...bird, gear },
    birds: data.birds,
    closet: data.closet,
    now: data.serverNow,
  });
  const cells = closetCells(wardrobeFor(worn));
  const effects = effectsFor(worn);
  const update = (change: Partial<Saves>) => {
    latest.current = { ...latest.current, ...change };
    setSaves(latest.current);
  };
  const selection = () => wornIn(latest.current);
  const save = (next: GearId[], body: GearBody = { items: next }) => {
    const done: Promise<void> = (
      latest.current.pending?.done ?? Promise.resolve()
    )
      .then(() => putGear(bird.id, body))
      .then(
        ({ gear, skipped }) => {
          const note = skippedNote(bird.name, skipped);
          if (note) toast(note);
          const worn = gear ?? next.filter((i) => !skipped.includes(i));
          update({ confirmed: { birdId: bird.id, worn, savedAt: Date.now() } });
        },
        (err: unknown) => {
          toast(err instanceof Error ? err.message : String(err));
        },
      )
      .then(() => {
        if (latest.current.pending?.done !== done) return;
        update({ pending: null });
        refresh();
      });
    update({ pending: { birdId: bird.id, worn: next, done } });
  };
  const dress = (item: GearId) => {
    const current = selection();
    const cell = closetCells(wardrobeFor(current)).find((c) => c.item === item);
    const next = cell && pick(current, cell);
    if (next) save(next);
  };
  const outfits = data.outfits.map((outfit) => {
    const gear = applyOutfit(wardrobeFor(worn), outfit);
    const wearing =
      gear.length > 0 &&
      gear.length === worn.length &&
      gear.every((item) => worn.includes(item));
    return { outfit, gear, wearing };
  });

  return (
    <main className={styles.screen}>
      <header className={styles.header}>
        <BackLink href={`/birds/${bird.id}`} label={`Back to ${bird.name}`} />
        <h1 className={styles.title}>Flock closet</h1>
        <Link href="/shop" className={styles.storeLink}>
          Store
        </Link>
      </header>
      <section className={styles.stand}>
        <Bird
          look={bird.look as Look}
          breed={bird.breed}
          gear={worn}
          pose="perched"
          size={176}
          title={`${bird.name} wearing the outfit you picked`}
        />
        <div className={styles.effects}>
          <h2 className={styles.effectsHeading}>What it does</h2>
          {effects.length === 0 ? (
            <p className={styles.effect}>Nothing on yet.</p>
          ) : (
            <ul className={styles.effectList}>
              {effects.map((effect) => (
                <li key={effect} className={styles.effect}>
                  {effect}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
      <WeatherTip
        pronoun={bird.pronoun as Pronoun}
        cells={cells}
        worn={worn}
        dress={dress}
      />
      {outfits.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionTop}>
            <h2 className={styles.heading}>Saved outfits</h2>
          </div>
          <div className={styles.chips}>
            {outfits.map(({ outfit, gear, wearing }) => (
              <button
                key={outfit.id}
                type="button"
                className={styles.chip}
                aria-pressed={wearing}
                disabled={gear.length === 0}
                onClick={() => save(gear, { outfitId: outfit.id })}
              >
                {outfit.name}
              </button>
            ))}
          </div>
        </section>
      )}
      <section className={styles.section}>
        <div className={styles.sectionTop}>
          <h2 className={styles.heading}>Closet</h2>
          <p className={styles.hint}>
            {`Shared by every bird. Tap to dress ${bird.name}.`}
          </p>
        </div>
        <div className={styles.grid}>
          {byShelf(cells).map((cell) => (
            <ClosetTile
              key={cell.item}
              cell={cell}
              enabled={pick(worn, cell) !== null}
              dress={dress}
            />
          ))}
        </div>
      </section>
    </main>
  );
}
