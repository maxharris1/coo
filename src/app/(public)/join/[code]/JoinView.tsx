import { Bird } from "@/components/Bird";
import { HatchScene } from "@/components/HatchScene";
import { config } from "@/lib/config";
import { inviteCopy } from "@/lib/inviteCopy";
import styles from "../../auth.module.css";
import { AddFriend } from "./AddFriend";
import { GetAPigeon } from "./GetAPigeon";

export function JoinView({
  name,
  code,
  signedIn,
}: {
  name: string;
  code: string;
  signedIn: boolean;
}) {
  const copy = inviteCopy(name);
  return (
    <main className={styles.page}>
      <div className={styles.brand}>
        <h1 className={styles.logo}>{config.app.name.toLowerCase()}</h1>
        <p className={styles.tagline}>{config.app.tagline}</p>
      </div>
      <div
        className={styles.hero}
        role="img"
        aria-label="A grey city pigeon, freshly hatched, standing between two halves of an eggshell and staring at you."
      >
        <HatchScene className={styles.scene} />
        <div className={styles.bird}>
          <Bird look="gerald" size={203} />
        </div>
      </div>
      <h1 className={styles.title}>{copy.headline}</h1>
      <p className={styles.lede}>{copy.subhead}</p>
      <div className={styles.actions}>
        {signedIn ? (
          <AddFriend code={code} label={copy.addButton} />
        ) : (
          <GetAPigeon code={code} />
        )}
      </div>
    </main>
  );
}
