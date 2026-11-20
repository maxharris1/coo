import type { Metadata } from "next";
import type { ReactNode } from "react";
import breeds from "../../../../config/breeds.json";
import gear from "../../../../config/gear.json";
import birds from "../../../../public/assets/data/birds.json";
import index from "../../../../public/assets/rig-reference/index.json";
import { Bird, GEAR_IDS, LOOKS, POSES } from "@/components/Bird";
import type { GearId, Look, Pose } from "@/components/Bird";
import { GearIcon } from "@/components/GearIcon";
import { Landing, Takeoff } from "@/components/Takeoff";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Birds" };

type Entry = {
  name: string;
  note: string;
  body: string;
  wing: string;
  collar: string;
  speed?: string;
  breed?: string;
};

const BIRDS: Record<Look, Entry> = birds;
const BREED_NAMES = new Map(breeds.breeds.map((b) => [b.id, b.name]));

const POSE_LABELS: Record<Pose, string> = {
  perched: "Perched",
  sleep: "Asleep",
  eat: "Eating",
  sulk: "Sulking",
  surprise: "Startled",
  crouch: "Crouch",
  landed: "Just landed",
  proud: "Proud",
  fly: "Flight",
};

const isGearId = (id: string): id is GearId =>
  (GEAR_IDS as readonly string[]).includes(id);

const SETS = index.files.flatMap((f) => {
  const [look, pose, set] = f.file.replace(".svg", "").split("--");
  return look === "gerald" && pose === "perched" && set
    ? [{ set, gear: f.gear.filter(isGearId) }]
    : [];
});

const ITEMS = gear.items.flatMap((item) =>
  isGearId(item.id) ? [{ ...item, id: item.id }] : [],
);

const capitalise = (s: string) => s[0].toUpperCase() + s.slice(1);

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className={styles.section}>
      <h2 id={id} className={styles.heading}>
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function BirdsPage() {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Birds</h1>
      <Section id="flock" title="The flock">
        <div className={styles.grid}>
          {LOOKS.filter((look) => !BIRDS[look].breed).map((look) => {
            const bird = BIRDS[look];
            return (
              <article key={look} className={styles.sky}>
                <Bird look={look} size={120} title={bird.name} />
                <p className={styles.caption}>
                  <b>{bird.name}</b> {bird.note} {bird.speed}.
                </p>
                <div className={styles.dots}>
                  {[bird.body, bird.wing, bird.collar].map((colour, i) => (
                    <span
                      key={i}
                      className={styles.dot}
                      style={{ background: colour }}
                    />
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      </Section>
      <Section id="poses" title="Every look in every pose">
        {LOOKS.map((look) => {
          const bird = BIRDS[look];
          return (
            <div key={look} className={styles.row}>
              <p className={styles.caption}>
                <b>{bird.name}</b>{" "}
                <span>{BREED_NAMES.get(bird.breed ?? "city")}</span>
              </p>
              {POSES.map((pose) => (
                <div key={pose} className={styles.cell}>
                  <Bird
                    look={look}
                    pose={pose}
                    size={84}
                    title={`${bird.name} ${POSE_LABELS[pose]}`}
                  />
                </div>
              ))}
            </div>
          );
        })}
      </Section>
      <Section id="dressed" title="Dressed">
        <div className={styles.grid}>
          {SETS.map(({ set, gear }) => (
            <article key={set} className={styles.sky}>
              <h3 className={styles.caption}>{set}</h3>
              {(["perched", "fly"] as const).map((pose) => (
                <Bird
                  key={pose}
                  look="gerald"
                  pose={pose}
                  gear={gear}
                  size={110}
                  title={`Gerald ${set} ${POSE_LABELS[pose]}`}
                />
              ))}
              <div className={styles.dots}>
                {gear.map((id) => (
                  <GearIcon key={id} id={id} size={36} />
                ))}
              </div>
            </article>
          ))}
        </div>
      </Section>
      <Section id="gear" title="Gear">
        <div className={styles.grid}>
          {ITEMS.map((item) => (
            <article key={item.id} className={styles.sky}>
              <Bird
                look="gerald"
                gear={[item.id]}
                size={110}
                title={`Gerald wearing ${item.name}`}
              />
              <GearIcon id={item.id} title={item.name} />
              <p className={styles.caption}>
                <b>{item.name}</b> {capitalise(item.slot)} slot. {item.price}{" "}
                seeds
                {item.starter ? " (starter set)" : ""}. {item.effect}
              </p>
            </article>
          ))}
        </div>
      </Section>
      <Section id="flight" title="Takeoff and landing">
        <div className={styles.grid}>
          <div className={styles.sky}>
            <Takeoff look="gerald" title="Gerald taking off" />
          </div>
          <div className={styles.sky}>
            <Landing look="gerald" title="Gerald landing" />
          </div>
        </div>
      </Section>
    </main>
  );
}
