import type { CSSProperties, ReactNode } from "react";
import tokens from "../../../../public/assets/tokens.json";
import styles from "./TokensPanel.module.css";

type ColourName = keyof typeof tokens.color;
type RadiusName = keyof typeof tokens.radius;
type FontName = keyof typeof tokens.font;

type ContrastPair = {
  text: ColourName;
  surface: ColourName;
  ratio: string;
  verdict: "Passes for all text" | "Large text only";
};
type ShapeSample = { label: string; use: string; style: CSSProperties };
type TypeSample = { spec: string; text: string; style: CSSProperties };
type TypeFamily = {
  font: FontName;
  name: string;
  use: string;
  samples: TypeSample[];
};

const colourRoles = {
  ink: "Text, outlines, hard shadows",
  paper: "App background",
  card: "Cards, inputs, note paper",
  sky: "Hero areas, water, info cards",
  tomato: "Primary action, flown path, alerts",
  sun: "Selected state, secondary action, seeds",
  mint: "Ready, good odds, grass",
  lilac: "Resting, roosting, quirks",
  peach: "Soft warning tiles",
  sand: "Locked or unavailable",
  muted: "Secondary text on paper or card",
  stamp: "Postmarks and stamp ink",
  night: "Map land after dusk",
  "night-water": "Map water after dusk",
} satisfies Record<ColourName, string>;

const darkSwatches: ReadonlySet<ColourName> = new Set([
  "ink",
  "muted",
  "stamp",
  "night",
  "night-water",
]);

const colours = Object.entries(tokens.color) as [ColourName, string][];

const contrastPairs: ContrastPair[] = [
  {
    text: "ink",
    surface: "paper",
    ratio: "13.8",
    verdict: "Passes for all text",
  },
  {
    text: "ink",
    surface: "card",
    ratio: "14.6",
    verdict: "Passes for all text",
  },
  {
    text: "ink",
    surface: "sky",
    ratio: "10.3",
    verdict: "Passes for all text",
  },
  {
    text: "ink",
    surface: "tomato",
    ratio: "4.8",
    verdict: "Passes for all text",
  },
  { text: "ink", surface: "sun", ratio: "9.8", verdict: "Passes for all text" },
  {
    text: "ink",
    surface: "mint",
    ratio: "9.0",
    verdict: "Passes for all text",
  },
  {
    text: "ink",
    surface: "lilac",
    ratio: "10.2",
    verdict: "Passes for all text",
  },
  {
    text: "muted",
    surface: "paper",
    ratio: "6.3",
    verdict: "Passes for all text",
  },
  {
    text: "muted",
    surface: "card",
    ratio: "6.6",
    verdict: "Passes for all text",
  },
  {
    text: "stamp",
    surface: "card",
    ratio: "5.2",
    verdict: "Passes for all text",
  },
  {
    text: "paper",
    surface: "night",
    ratio: "8.0",
    verdict: "Passes for all text",
  },
  { text: "card", surface: "tomato", ratio: "3.0", verdict: "Large text only" },
];

const radiusUses = {
  paper: "Paper, forms",
  tile: "Small buttons, tiles",
  row: "Rows and cards",
  card: "Feature cards",
  button: "Main buttons",
  pill: "Pills, chips",
} satisfies Record<RadiusName, string>;

const shadowUses = ["Small raised", "Cards, selected", "Main buttons"];

const shapeSpecimens: ShapeSample[] = [
  ...(Object.entries(tokens.radius) as [RadiusName, number][]).map(
    ([name, px]) => ({
      label: String(px),
      use: radiusUses[name],
      style: { borderRadius: `var(--coo-radius-${name})` },
    }),
  ),
  {
    label: "2px line",
    use: "Chips, inner tiles",
    style: { border: "var(--coo-line-thin)" },
  },
  {
    label: `${tokens.line}px line`,
    use: "Default outline",
    style: { border: "var(--coo-line)" },
  },
  ...tokens.shadow.map((px, i) => ({
    label: `0 ${px}px 0`,
    use: shadowUses[i],
    style: { boxShadow: `var(--coo-shadow-${i + 1})` },
  })),
  {
    label: "dashed",
    use: "Locked, add new",
    style: { borderStyle: "dashed", background: "var(--coo-sand)" },
  },
];

const typeFamilies: TypeFamily[] = [
  {
    font: "display",
    name: "Bagel Fat One",
    use: "Display: wordmark, screen titles, big numbers, main buttons",
    samples: [
      {
        spec: "52 / 1.0",
        text: "And he's off",
        style: { fontWeight: 400, fontSize: 52, lineHeight: 1 },
      },
      {
        spec: "36 / 1.0",
        text: "Seed store",
        style: { fontWeight: 400, fontSize: 36, lineHeight: 1 },
      },
      {
        spec: "28 / 1.0",
        text: "New pigeon post",
        style: { fontWeight: 400, fontSize: 28, lineHeight: 1 },
      },
      {
        spec: "22 / 1.05",
        text: "Gerald is over Edison, NJ",
        style: { fontWeight: 400, fontSize: 22, lineHeight: 1.05 },
      },
    ],
  },
  {
    font: "body",
    name: "Nunito 700, 800, 900",
    use: "Everything else. 900 for labels and names, 800 for body, 700 for secondary lines",
    samples: [
      {
        spec: "17 / 900",
        text: "Lands in 1h 07m",
        style: { fontWeight: 900, fontSize: 17 },
      },
      {
        spec: "15 / 900",
        text: "Incoming from Priya",
        style: { fontWeight: 900, fontSize: 15 },
      },
      {
        spec: "14 / 800",
        text: "Your note to Theo is running late.",
        style: { fontWeight: 800, fontSize: 14 },
      },
      {
        spec: "13 / 700",
        text: "Philadelphia, 81 miles as the pigeon flies",
        style: { fontWeight: 700, fontSize: 13, color: "var(--coo-muted)" },
      },
      {
        spec: "11.5 / 900",
        text: "BUREAU OF PIGEON AFFAIRS",
        style: { fontWeight: 900, fontSize: 11.5, letterSpacing: 1 },
      },
    ],
  },
  {
    font: "hand",
    name: "Caveat 700",
    use: "Handwriting: notes, name fields, speech bubbles. Never for interface labels",
    samples: [
      {
        spec: "27 / 34",
        text: "Dinner Saturday? I'll bring the good bread.",
        style: { fontWeight: 700, fontSize: 27, lineHeight: 1.1 },
      },
      {
        spec: "22 / 1.3",
        text: "ooh, a bagel",
        style: { fontWeight: 700, fontSize: 22, lineHeight: 1.1 },
      },
      {
        spec: "30",
        text: "Gerald",
        style: { fontWeight: 700, fontSize: 30, lineHeight: 1.1 },
      },
    ],
  },
];

const spacingSteps = [4, 6, 8, 10, 12, 14, 16, 20, 28, 44];

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.section}>
      <header className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>{title}</h2>
        {note && <p className={styles.note}>{note}</p>}
      </header>
      {children}
    </section>
  );
}

export function TokensPanel() {
  return (
    <div className={styles.panel}>
      <Section
        title="Colour tokens"
        note="Fourteen named colours. Ink is the only text colour on light surfaces."
      >
        <ul className={styles.swatches}>
          {colours.map(([name, hex]) => (
            <li key={name} className={styles.swatch}>
              <div
                className={
                  darkSwatches.has(name)
                    ? `${styles.chip} ${styles.chipDark}`
                    : styles.chip
                }
                style={{ background: `var(--coo-${name})` }}
              >
                {hex}
              </div>
              <div className={styles.swatchText}>
                <span className={styles.tokenName}>{`--coo-${name}`}</span>
                <span className={styles.caption}>{colourRoles[name]}</span>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="Contrast pairs"
        note="Measured WCAG ratios. Tomato and sun always carry ink text, never white."
      >
        <ul className={styles.pairs}>
          {contrastPairs.map(({ text, surface, ratio, verdict }) => (
            <li key={`${text}-${surface}`} className={styles.pair}>
              <div
                className={styles.specimen}
                style={{
                  background: `var(--coo-${surface})`,
                  color: `var(--coo-${text})`,
                }}
              >
                Aa
              </div>
              <div className={styles.pairText}>
                <span
                  className={styles.pairLabel}
                >{`${text} on ${surface}`}</span>
                <span className={styles.ratio}>{`${ratio} to 1`}</span>
                <span className={styles.caption}>{verdict}</span>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="Type"
        note="Three Google Fonts families. Sizes are px over line height or weight."
      >
        <div className={styles.typeCards}>
          {typeFamilies.map(({ font, name, use, samples }) => (
            <div key={font} className={styles.card}>
              <div className={styles.typeHead}>
                <span className={styles.typeName}>{name}</span>
                <span className={styles.typeUse}>{use}</span>
                <span className={styles.stack}>{tokens.font[font]}</span>
              </div>
              {samples.map(({ spec, text, style }) => (
                <div key={spec} className={styles.sample}>
                  <span className={styles.spec}>{spec}</span>
                  <span
                    style={{ fontFamily: `var(--coo-font-${font})`, ...style }}
                  >
                    {text}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Outline, radius, shadow"
        note="Every raised thing has an ink outline and a hard shadow straight down. No blur anywhere."
      >
        <ul className={styles.shapes}>
          {shapeSpecimens.map(({ label, use, style }) => (
            <li key={label} className={styles.shape}>
              <div className={styles.shapeStage}>
                <div className={styles.tile} style={style} />
              </div>
              <span className={styles.shapeLabel}>{label}</span>
              <span className={styles.caption}>{use}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Spacing">
        <ul className={styles.spacing}>
          {spacingSteps.map((px) => (
            <li key={px} className={styles.step}>
              <div className={styles.bar} style={{ width: px }} />
              <span className={styles.stepLabel}>{px}</span>
            </li>
          ))}
        </ul>
        <p className={styles.note}>
          Screen gutter is 16. Gaps inside a card are 6 to 12. Sections sit 12
          to 14 apart. 44 is the smallest touch target.
        </p>
      </Section>
    </div>
  );
}
