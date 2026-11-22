import Link from "next/link";
import type { CSSProperties } from "react";
import type { Breed, GearId, Look } from "@/components/Bird";
import { Takeoff } from "@/components/Takeoff";
import type { TakeoffCopy } from "./takeoffCopy";
import styles from "./Takeoff.module.css";

const ILLUSTRATIONS = "/assets/svg/illustrations";

type Art = {
  file: string;
  box: [number, number];
  width: number;
  left: number;
  top: number;
  animation: string;
  extra?: CSSProperties;
};

const CLOUDS: Art[] = [
  {
    width: 86,
    left: 24,
    top: 250,
    animation: "coo-drift 7s ease-in-out infinite alternate",
  },
  {
    width: 64,
    left: 270,
    top: 330,
    animation: "coo-drift 9s ease-in-out infinite alternate-reverse",
  },
  {
    width: 54,
    left: 150,
    top: 430,
    animation: "coo-drift 8s ease-in-out infinite alternate",
  },
].map((c) => ({ ...c, file: "cloud.svg", box: [74, 36] }));

const PUFFS: Art[] = [
  {
    width: 54,
    left: 40,
    top: 128,
    animation: "coo-puff 2.5s ease-out 1 forwards",
  },
  {
    width: 44,
    left: 150,
    top: 134,
    animation: "coo-puff 2.5s ease-out .08s 1 forwards",
  },
  {
    width: 34,
    left: 100,
    top: 142,
    animation: "coo-puff 2.5s ease-out .16s 1 forwards",
  },
].map((p) => ({
  ...p,
  file: "puff.svg",
  box: [44, 30],
  extra: { transformOrigin: "50% 100%", opacity: 0 },
}));

const FEATHERS: Art[] = [
  {
    width: 18,
    left: 150,
    top: 0,
    animation: "coo-feather 2.5s ease-in-out 1 forwards",
  },
  {
    width: 13,
    left: 96,
    top: 20,
    animation: "coo-feather 2.5s ease-in-out .25s 1 forwards",
  },
].map((f) => ({
  ...f,
  file: "feather.svg",
  box: [26, 44],
  extra: { opacity: 0 },
}));

function Illustration({
  file,
  box: [w, h],
  width,
  left,
  top,
  animation,
  extra,
}: Art) {
  return (
    <svg
      className={styles.art}
      viewBox={`0 0 ${w} ${h}`}
      width={width}
      aria-hidden="true"
      style={{ left, top, animation, ...extra }}
    >
      <image href={`${ILLUSTRATIONS}/${file}`} width={w} height={h} />
    </svg>
  );
}

type TakeoffViewProps = {
  flightId: string;
  bird: { name: string; look: string; gear: string[]; breed?: Breed };
  copy: TakeoffCopy;
  animate: boolean;
  href?: string;
  onGo?: () => void;
  watchLabel?: string;
  birdTitle?: string;
};

export function TakeoffView({
  flightId,
  bird,
  copy,
  animate,
  href = `/flights/${flightId}`,
  onGo,
  watchLabel = "Watch the flight",
  birdTitle = `${bird.name} launching off the ledge`,
}: TakeoffViewProps) {
  return (
    <div className={styles.screen}>
      <div className={styles.scene}>
        <svg
          className={styles.city}
          viewBox="0 540 390 304"
          width="390"
          height="304"
          aria-hidden="true"
        >
          <g className={styles.buildings}>
            <rect x="0" y="560" width="60" height="160" />
            <rect x="70" y="600" width="50" height="120" />
            <rect x="230" y="540" width="54" height="180" />
            <rect x="292" y="590" width="400" height="130" />
          </g>
          <rect
            className={styles.ledge}
            x="-6"
            y="700"
            width="702"
            height="150"
          />
          <path
            className={styles.bricks}
            d="M-6 724 H696 M-6 748 H696 M40 700 V724 M130 700 V724 M220 700 V724 M310 700 V724 M400 700 V724 M490 700 V724 M84 724 V748 M174 724 V748 M264 724 V748 M354 724 V748 M444 724 V748"
          />
        </svg>
        {animate && (
          <>
            {PUFFS.map((p) => (
              <Illustration key={p.left} {...p} />
            ))}
            {FEATHERS.map((f) => (
              <Illustration key={f.left} {...f} />
            ))}
            <div className={styles.bird}>
              <Takeoff
                look={bird.look as Look}
                breed={bird.breed}
                gear={bird.gear as GearId[]}
                size={160}
                title={birdTitle}
              />
            </div>
          </>
        )}
      </div>
      {CLOUDS.map((c) => (
        <Illustration key={c.left} {...c} />
      ))}
      <div className={styles.copy}>
        <div className={styles.released}>{copy.released}</div>
        <h1 className={styles.headline}>{copy.headline}</h1>
        <p className={styles.note}>{copy.note}</p>
      </div>
      <div className={styles.actions}>
        <Link href={href} replace onClick={onGo} className={styles.watch}>
          {watchLabel}
        </Link>
        {animate && (
          <div className={styles.hint}>
            The tracker opens by itself after a second.
          </div>
        )}
      </div>
    </div>
  );
}
