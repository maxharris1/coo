"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Pronoun } from "@/lib/format";
import type { GearId } from "@/lib/game/types";
import type { Forecast } from "@/server/services/forecast";
import { pick, type Cell } from "./closet";
import styles from "./page.module.css";
import { coveredBy, protection, tipFor, type Tip, type TipIcon } from "./tip";

type Props = {
  pronoun: Pronoun;
  cells: readonly Cell[];
  worn: readonly GearId[];
  dress: (item: GearId) => void;
};

type Action = { kind: "dress"; items: GearId[] } | { kind: "shop" } | null;

const iconPaths: Record<TipIcon, string[]> = {
  snow: [
    "M12 2 V22 M3.3 7 L20.7 17 M20.7 7 L3.3 17 M12 6 L9.5 3.5 M12 6 L14.5 3.5 M12 18 L9.5 20.5 M12 18 L14.5 20.5",
  ],
  rain: [
    "M7 14 a4 4 0 0 1 .6 -8 a5 5 0 0 1 9.4 1.2 a3.5 3.5 0 0 1 0 6.8 z",
    "M8 17 L7 20 M12 17 L11 20 M16 17 L15 20",
  ],
};

function actionFor(
  { counters, conditions }: Tip,
  { cells, worn }: Pick<Props, "cells" | "worn">,
): Action {
  const candidates = [
    ...new Set([...counters, ...conditions.flatMap((c) => protection[c])]),
  ].flatMap((item) => cells.filter((cell) => cell.item === item));

  const covered = coveredBy(worn, conditions);
  let best = { items: [] as GearId[], covered };
  let frontier = [{ items: [] as GearId[], outfit: worn }];
  const seen = new Set([[...worn].sort().join()]);
  while (frontier.length > 0) {
    const next: typeof frontier = [];
    for (const state of frontier) {
      for (const cell of candidates) {
        if (state.outfit.includes(cell.item)) continue;
        const outfit = pick(state.outfit, cell);
        if (!outfit) continue;
        const key = [...outfit].sort().join();
        if (seen.has(key)) continue;
        seen.add(key);
        const items = [...state.items, cell.item];
        const reached = coveredBy(outfit, conditions);
        if (
          covered.every((c) => reached.includes(c)) &&
          reached.length > best.covered.length
        )
          best = { items, covered: reached };
        next.push({ items, outfit });
      }
    }
    frontier = next;
  }
  const { items } = best;
  if (items.length > 0) return { kind: "dress", items };

  const uncovered = conditions.filter((c) => !best.covered.includes(c));
  return candidates.some(
    (cell) =>
      cell.kind === "store" &&
      uncovered.some((c) => protection[c].includes(cell.item)),
  )
    ? { kind: "shop" }
    : null;
}

export function TipBand({
  forecast,
  pronoun,
  cells,
  worn,
  dress,
}: Props & { forecast: Forecast }) {
  const tip = tipFor(forecast, pronoun);
  if (!tip) return null;
  const action = actionFor(tip, { cells, worn });
  return (
    <section className={styles.tip}>
      <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true">
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {iconPaths[tip.icon].map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
      </svg>
      <div className={styles.tipText}>
        <p className={styles.tipHeadline}>{tip.headline}</p>
        <p className={styles.tipSlowdown}>{tip.slowdown}</p>
      </div>
      {action?.kind === "dress" && (
        <button
          type="button"
          className={styles.tipButton}
          onClick={() => action.items.forEach((item) => dress(item))}
        >
          {tip.button}
        </button>
      )}
      {action?.kind === "shop" && (
        <Link href="/shop" className={styles.tipButton}>
          {tip.button}
        </Link>
      )}
    </section>
  );
}

export function WeatherTip(props: Props) {
  const [forecast, setForecast] = useState<Forecast | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/loft/forecast")
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { forecast?: Forecast } | null) => {
        if (live && json?.forecast) setForecast(json.forecast);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return forecast && <TipBand forecast={forecast} {...props} />;
}
