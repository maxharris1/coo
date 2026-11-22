import Link from "next/link";
import type { ReactNode } from "react";
import { Bird, type Breed, type GearId, type Look } from "@/components/Bird";
import { config } from "@/lib/config";
import { fill, type Pronoun } from "@/lib/format";
import { shareMessage, smsHref } from "./shareLink";
import styles from "./ShareLink.module.css";

function Icon({ size, children }: { size: number; children: ReactNode }) {
  return (
    <svg
      className={styles.icon}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <g>{children}</g>
    </svg>
  );
}

const REASSURANCES: { icon: ReactNode; line: string }[] = [
  {
    icon: (
      <>
        <path d="M2 12 Q12 3 22 12 Q12 21 2 12 Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    line: "They can watch the flight the moment they tap it.",
  },
  {
    icon: (
      <>
        <rect x="5" y="11" width="14" height="10" rx="2.5" />
        <path d="M8 11 V8 a4 4 0 0 1 8 0 V11" />
      </>
    ),
    line: "The note stays sealed until {bird} lands.",
  },
  {
    icon: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21 a8 8 0 0 1 16 0" />
      </>
    ),
    line: "No app or account needed to read it.",
  },
  {
    icon: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7 V12 L15.5 14" />
      </>
    ),
    line: "Not opened in {days} days? The note comes back to you.",
  },
];

type ShareLinkViewProps = {
  flightId: string;
  bird: { name: string; look: string; gear: string[]; breed?: Breed };
  pronoun: Pronoun;
  guestName: string;
  place?: string;
  lands?: string;
  url: string;
  canShare: boolean;
  onCopy: () => void;
  onShare: () => void;
};

export function ShareLinkView({
  flightId,
  bird,
  pronoun,
  guestName,
  place,
  lands,
  url,
  canShare,
  onCopy,
  onShare,
}: ShareLinkViewProps) {
  const message = shareMessage(url, pronoun);
  const tokens = {
    bird: bird.name,
    days: config.game.guestLinks.expireDays,
    place,
    lands,
  };
  return (
    <main className={styles.screen}>
      <div className={styles.status}>
        <span className={styles.avatar}>
          <span className={styles.avatarBird}>
            <Bird
              look={bird.look as Look}
              breed={bird.breed}
              gear={bird.gear as GearId[]}
              animated={false}
              size={99}
            />
          </span>
        </span>
        <div className={styles.statusText}>
          <div className={styles.statusTitle}>{bird.name} is in the air</div>
          <div className={styles.statusLine}>
            {fill("Flying to {place}. Lands about {lands}.", tokens)}
          </div>
        </div>
      </div>
      <h1 className={styles.heading}>Now text {guestName} their link</h1>
      <div className={styles.preview}>
        <div className={styles.previewLabel}>What {guestName} gets</div>
        <div className={styles.previewBody}>
          {message.replace(url, "").trimEnd()}
        </div>
        <div className={styles.previewUrl}>{url}</div>
      </div>
      <a href={smsHref(message)} className={styles.text}>
        <Icon size={26}>
          <path d="M4 5 H20 V16 H11 L6 20 V16 H4 Z" />
        </Icon>
        <span>Text it to {guestName}</span>
      </a>
      <div className={styles.actions}>
        <button type="button" className={styles.action} onClick={onCopy}>
          <Icon size={20}>
            <rect x="8" y="8" width="12" height="12" rx="2.5" />
            <path d="M16 8 V6 a2 2 0 0 0 -2 -2 H6 a2 2 0 0 0 -2 2 v8 a2 2 0 0 0 2 2 h2" />
          </Icon>
          <span>Copy link</span>
        </button>
        {canShare && (
          <button type="button" className={styles.action} onClick={onShare}>
            <Icon size={20}>
              <path d="M8 10 H6 V21 H18 V10 H16 M12 15 V3 M8 7 L12 3 L16 7" />
            </Icon>
            <span>Share another way</span>
          </button>
        )}
      </div>
      <ul className={styles.reassurances}>
        {REASSURANCES.map(({ icon, line }) => (
          <li key={line} className={styles.reassurance}>
            <Icon size={22}>{icon}</Icon>
            <span>{fill(line, tokens)}</span>
          </li>
        ))}
      </ul>
      <Link href={`/flights/${flightId}`} className={styles.watch}>
        Watch the flight
      </Link>
    </main>
  );
}

export function ShareLinkGone({ flightId }: { flightId: string }) {
  return (
    <main className={styles.screen}>
      <p className={styles.gone}>
        This link was shown once. Send another bird to make a new one.
      </p>
      <Link href={`/flights/${flightId}`} className={styles.watch}>
        Watch the flight
      </Link>
    </main>
  );
}
