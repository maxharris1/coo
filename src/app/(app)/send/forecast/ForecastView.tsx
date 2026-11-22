import Link from "next/link";
import type { FactorKind } from "@/server/services/flights/factors";
import type { ForecastModel, HourChip } from "./forecast";
import styles from "./Forecast.module.css";

export type ForecastViewProps = {
  model: ForecastModel;
  backHref: string;
  sending: boolean;
  onPick: (at: number) => void;
  onSchedule: (at: number) => void;
  onSend: (releaseAt: number | undefined) => void;
};

type Tint = "sky" | "lilac" | "peach" | "sun" | "sand";

const FACTOR_LOOK: Record<FactorKind, { icon: string; tint: Tint }> = {
  headwind: { icon: "wind", tint: "sky" },
  tailwind: { icon: "wind", tint: "sky" },
  rain: { icon: "rain", tint: "lilac" },
  downpour: { icon: "rain", tint: "lilac" },
  cold: { icon: "snow", tint: "sky" },
  snow: { icon: "snow", tint: "sky" },
  hawk: { icon: "hawk", tint: "peach" },
  fair: { icon: "tent", tint: "sun" },
  hungry: { icon: "seed", tint: "sun" },
  scruffy: { icon: "feather", tint: "lilac" },
  tired: { icon: "moon", tint: "lilac" },
  distance: { icon: "map", tint: "sand" },
};

const GOOD_ODDS_PCT = 90;

function tone(chip: HourChip): "roosts" | "good" | "fair" {
  if (chip.roosts) return "roosts";
  return Number.parseInt(chip.odds, 10) >= GOOD_ODDS_PCT ? "good" : "fair";
}

const mask = (icon: string) => {
  const url = `url(/assets/svg/icons/${icon}.svg)`;
  return { maskImage: url, WebkitMaskImage: url };
};

export function ForecastView({
  model,
  backHref,
  sending,
  onPick,
  onSchedule,
  onSend,
}: ForecastViewProps) {
  const raining = model.factors.some(
    (f) => f.kind === "rain" || f.kind === "downpour",
  );
  const { best, send } = model;
  return (
    <main className={styles.screen}>
      <header className={styles.header}>
        <Link
          href={backHref}
          aria-label="Back to your note"
          className={styles.back}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 5 L8 12 L15 19" />
          </svg>
        </Link>
        <div className={styles.titles}>
          <h1 className={styles.title}>Flight forecast</h1>
          <div className={styles.route}>{model.route}</div>
        </div>
      </header>

      <section className={styles.section}>
        <h2 className={styles.heading}>{model.question}</h2>
        <div className={styles.chips}>
          {model.chips.map((chip) => (
            <button
              key={chip.at}
              type="button"
              aria-pressed={chip.selected}
              className={`${styles.chip} ${styles[tone(chip)]}`}
              onClick={() => onPick(chip.at)}
            >
              <span className={styles.chipHour}>{chip.label}</span>
              <span
                className={chip.roosts ? styles.chipRoosts : styles.chipOdds}
              >
                {chip.roosts ? "Roosts" : chip.odds}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className={styles.hero}>
        <div className={styles.heroText}>
          <div className={styles.odds}>{model.selected.odds}</div>
          <div className={styles.oddsHeading}>{model.selected.heading}</div>
          <div className={styles.oddsDetail}>{model.selected.detail}</div>
        </div>
        {raining ? (
          <svg
            className={styles.weather}
            width="96"
            height="92"
            viewBox="0 0 96 92"
            role="img"
            aria-label="Rain cloud"
          >
            <path
              className={styles.cloud}
              d="M22 54 q-14 -2 -12 -16 q2 -14 18 -13 q8 -16 26 -10 q16 -4 22 12 q14 2 12 16 q-2 12 -16 11 z"
            />
            <g className={styles.drops}>
              <path d="M30 66 L26 78" />
              <path d="M48 66 L44 78" />
              <path d="M66 66 L62 78" />
            </g>
          </svg>
        ) : (
          <span
            role="img"
            aria-label="Clear skies"
            className={styles.clear}
            style={mask("sun")}
          />
        )}
      </section>

      {model.factors.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.heading}>Along the route</h2>
          {model.factors.map((factor, i) => {
            const look = FACTOR_LOOK[factor.kind];
            return (
              <div key={`${factor.kind}-${i}`} className={styles.factor}>
                <span className={`${styles.factorTile} ${styles[look.tint]}`}>
                  <span
                    aria-hidden="true"
                    className={styles.factorIcon}
                    style={mask(look.icon)}
                  />
                </span>
                <div className={styles.factorText}>
                  <span className={styles.factorTitle}>{factor.title}</span>
                  <span className={styles.factorLine}>{factor.text}</span>
                </div>
                <div className={styles.effect}>{factor.effect}</div>
              </div>
            );
          })}
        </section>
      )}

      <p className={styles.sunset}>{model.sunset}</p>

      <div className={styles.footer}>
        {best && (
          <button
            type="button"
            className={styles.primary}
            disabled={sending}
            onClick={() => onSchedule(best.at)}
          >
            {best.label}
          </button>
        )}
        <button
          type="button"
          className={best ? styles.secondary : styles.primary}
          disabled={sending}
          onClick={() => onSend(send.releaseAt)}
        >
          {send.label}
        </button>
      </div>
    </main>
  );
}
