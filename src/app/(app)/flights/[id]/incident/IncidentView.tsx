import Link from "next/link";
import { Bird, type Breed, type GearId, type Look } from "@/components/Bird";
import type { IncidentReport } from "./incident";
import styles from "./Incident.module.css";

const ILLUSTRATIONS = "/assets/svg/illustrations";

export type IncidentViewProps = {
  report: IncidentReport;
  bird: { name: string; look: Look; breed?: Breed; gear: readonly GearId[] };
};

export function IncidentView({ report, bird }: IncidentViewProps) {
  const { place } = report;
  const label = place
    ? `${bird.name}, standing on a statue in ${place}`
    : `${bird.name}, standing on a statue`;

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <Link href="/" aria-label="Back to the loft" className={styles.back}>
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
        <div className={styles.titles}>
          <div className={styles.kicker}>Bureau of Pigeon Affairs</div>
          <div className={styles.reportNo}>
            Flight incident report no. {report.reportNo}
          </div>
        </div>
      </header>

      <div className={styles.lede}>
        <h1 className={styles.headline}>{report.headline}</h1>
        <p className={styles.sub}>{report.sub}</p>
      </div>

      <div className={styles.illustration} role="img" aria-label={label}>
        <div className={styles.grass} aria-hidden="true" />
        {place && (
          <div className={styles.signpost} aria-hidden="true">
            <span className={styles.sign}>{place}</span>
            <span className={styles.post} />
          </div>
        )}
        <div className={styles.scene} aria-hidden="true">
          <svg viewBox="0 0 354 176" width="354" height="176">
            <image
              href={`${ILLUSTRATIONS}/cloud.svg`}
              x="30"
              y="16"
              width="74"
              height="36"
            />
            <image
              href={`${ILLUSTRATIONS}/statue.svg`}
              x="130"
              y="64"
              width="90"
              height="98"
            />
            <image
              href={`${ILLUSTRATIONS}/pretzel.svg`}
              x="199"
              y="22"
              width="38"
              height="32"
            />
          </svg>
          <div className={styles.bird}>
            <Bird
              look={bird.look}
              breed={bird.breed}
              gear={bird.gear}
              size={84}
            />
          </div>
        </div>
        <div className={styles.stamp} aria-hidden="true">
          DELAYED
        </div>
      </div>

      <dl className={styles.facts}>
        {report.rows.map((row) => (
          <div key={row.label} className={styles.row}>
            <dt className={styles.label}>{row.label}</dt>
            <dd className={styles.value}>{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
