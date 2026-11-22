"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Pronoun } from "@/lib/format";
import type { GearId } from "@/lib/game/types";
import type { Forecast } from "@/server/services/forecast";
import { pick, type Cell } from "./closet";
import styles from "./page.module.css";
import { tipFor, type TipIcon } from "./tip";

type Props = {
  pronoun: Pronoun;
  cells: readonly Cell[];
  worn: readonly GearId[];
  dress: (item: GearId) => void;
};

type Action = { kind: "dress"; item: GearId } | { kind: "shop" } | null;

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
  counters: readonly GearId[],
  { cells, worn }: Pick<Props, "cells" | "worn">,
): Action {
  if (counters.some((item) => worn.includes(item))) return null;
  const options = counters.flatMap((item) =>
    cells.filter((cell) => cell.item === item),
  );
  const wearable = options.find((cell) => pick(worn, cell) !== null);
  if (wearable) return { kind: "dress", item: wearable.item };
  return options.some((cell) => cell.kind === "store")
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
  const action = actionFor(tip.counters, { cells, worn });
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
          onClick={() => dress(action.item)}
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
