import birds from "../../public/assets/data/birds.json";

export const LOOKS = Object.keys(birds) as Look[];
export type Look = keyof typeof birds;
export type Breed =
  "city" | "fantail" | "pouter" | "frillback" | "jacobin" | "king" | "tumbler";
export const POSES = [
  "perched",
  "sleep",
  "eat",
  "sulk",
  "surprise",
  "crouch",
  "landed",
  "proud",
  "fly",
] as const;
export type Pose = (typeof POSES)[number];
export const GEAR_IDS = [
  "goggles",
  "scarf",
  "bow",
  "bandana",
  "beanie",
  "rainhat",
  "cap",
  "party",
  "earmuffs",
  "nightgoggles",
  "band",
  "bell",
  "tube",
  "booties",
  "backpack",
] as const;
export type GearId = (typeof GEAR_IDS)[number];

type Palette = {
  body: string;
  wing: string;
  collar: string;
  sheen?: string;
  breed?: string;
  rx?: number;
  ry?: number;
};
type Eye = "open" | "closed" | "happy" | "wide" | "lid";
type Part =
  | "all"
  | "tail"
  | "torso"
  | "wing"
  | "wing2"
  | "core"
  | "head"
  | "scarf"
  | "pom"
  | "bell";
type Motion = Partial<Record<Part, string>> & { blink?: true; streak?: true };

const INK = "#2A2140",
  CARD = "#FFFBF0",
  TOMATO = "#F4623F",
  SUN = "#FFC93C",
  ROSE = "#F59C8E",
  LILAC = "#D5D1EA";
const SW = 3;
const W = Math.round(SW * 0.82 * 10) / 10;
const T = Math.round(SW * 0.56 * 10) / 10;
const S = `stroke="${INK}" stroke-width="${SW}"`;
const J = `${S} stroke-linejoin="round"`;

const GOGGLE_LENS = {
  goggles: "#DFF3FC",
  nightgoggles: "#86D9A0",
} satisfies Partial<Record<GearId, string>>;

type Goggles = keyof typeof GOGGLE_LENS;

const goggleLens = (gear: readonly GearId[]) => {
  const worn = gear.find((id): id is Goggles => id in GOGGLE_LENS);
  return worn && GOGGLE_LENS[worn];
};

const preGoggles = (lens: string) =>
  `<path d="M68.5 30 Q74 21.5 83 25" fill="none" stroke="#2A2140" stroke-width="6.6" stroke-linecap="round"/><path d="M68.5 30 Q74 21.5 83 25" fill="none" stroke="#D99A6C" stroke-width="3.6" stroke-linecap="round"/><rect x="71.5" y="22.6" width="4.6" height="5.6" rx="1.2" fill="#FFC93C" stroke="#2A2140" stroke-width="1.6" transform="rotate(-28 73.8 25.4)"/><circle cx="92" cy="30" r="11.2" fill="#FFC93C" stroke="#2A2140" stroke-width="2.6"/><circle cx="92" cy="30" r="8.6" fill="${lens}" stroke="#2A2140" stroke-width="2"/>`;

const GLINT =
  '<path d="M85.6 25.4 Q88 22.4 91.6 22" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke="#FFFBF0" stroke-width="2.2"/>';

const ON: Record<GearId, string> = {
  goggles: GLINT,
  nightgoggles: GLINT,
  scarf:
    '<g§scarf§><path d="M79 59 L78 84 L87.5 83 L86 61 Z" fill="#D24F2E" stroke="#2A2140" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/><path d="M78.3 76 H86.8 M78.2 80 H87" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke="#FFFBF0" stroke-width="2"/><path d="M79.5 84 v4 M83 83.8 v4 M86.4 83.4 v4" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke="#2A2140" stroke-width="1.6"/><path d="M73 57 L66 80 L76 83 L80.5 61 Z" fill="#F4623F" stroke="#2A2140" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/><path d="M68.6 72 L77.6 74.6 M67.4 76.4 L76.8 79" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke="#FFFBF0" stroke-width="2"/><path d="M66.4 80.4 l-1 4 M69.8 81.4 l-.7 4 M73.2 82.3 l-.3 4" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke="#2A2140" stroke-width="1.6"/></g><ellipse cx="83" cy="53" rx="17.5" ry="9" fill="#F4623F" stroke="#2A2140" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/><path d="M67.5 51 Q83 60.5 98.5 51" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke="#D24F2E" stroke-width="2.4"/><path d="M71 49.5 Q83 55 95 49.5" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke="#FFFBF0" stroke-width="2.2"/>',
  bow: '<path d="M99 53 C94 45.5 88 44.5 87 47 V59 C88 61.5 94 60.5 99 53 Z" fill="#A98BE8" stroke="#2A2140" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/><path d="M99 53 C104 45.5 110 44.5 111 47 V59 C110 61.5 104 60.5 99 53 Z" fill="#A98BE8" stroke="#2A2140" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/><path d="M90.5 49.5 L94.5 53 L90.5 56.5 M107.5 49.5 L103.5 53 L107.5 56.5" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke="#7E63C9" stroke-width="1.8"/><g fill="#FFFBF0"><circle cx="89.6" cy="48.4" r="1.1"/><circle cx="89.6" cy="57.6" r="1.1"/><circle cx="108.4" cy="48.4" r="1.1"/><circle cx="108.4" cy="57.6" r="1.1"/></g><rect x="96" y="49.4" width="6" height="7.2" rx="2.4" fill="#7E63C9" stroke="#2A2140" stroke-width="2"/>',
  bandana:
    '<path d="M69 50 L60.5 44.5 L63 53 Z M69 52 L60 56.5 L66.5 58.5 Z" fill="#FFC93C" stroke="#2A2140" stroke-width="2.2" stroke-linejoin="round"/><path d="M67 48 Q83 56.5 99 48 L86 75 Z" fill="#FFC93C" stroke="#2A2140" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/><path d="M67 48 Q83 56.5 99 48 Q83 62 67 48 Z" fill="#E0A922"/><path d="M67 48 Q83 56.5 99 48" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke="#2A2140" stroke-width="2.4"/><g fill="#2A2140"><circle cx="79.5" cy="59.5" r="1.6"/><circle cx="88.5" cy="59.5" r="1.6"/><circle cx="84.5" cy="66" r="1.6"/></g><g fill="#FFFBF0"><circle cx="84" cy="62" r="1"/><circle cx="86" cy="70" r="1"/></g>',
  beanie:
    '<path d="M67.5 27 Q66 4 87 4 Q106 5 105.5 25 Q86 15 67.5 27 Z" fill="#F4623F" stroke="#2A2140" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/><path d="M77 8 Q75 15 76 21 M87 5.5 Q86 12 87 17.5 M97 8 Q97.5 14 97 20" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke="#D24F2E" stroke-width="2"/><path d="M66.5 28.5 Q86 15.5 106.5 26.5" fill="none" stroke="#2A2140" stroke-width="9.6" stroke-linecap="round"/><path d="M66.5 28.5 Q86 15.5 106.5 26.5" fill="none" stroke="#FFFBF0" stroke-width="5.8" stroke-linecap="round"/><path d="M72 23.2 l1.5 3.8 M79 19.8 l1.2 4 M86 18.4 l.6 4.2 M93 19 l-.2 4.2 M100 21 l-1 4" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke="#B9B3C9" stroke-width="1.6"/><g§pom§><circle cx="87" cy="0" r="6.2" fill="#FFFBF0" stroke="#2A2140" stroke-width="2.2"/><path d="M84 -2 l2 2 M89.5 -3 l-1 3 M86 3 l3 -1.2" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke="#B9B3C9" stroke-width="1.4"/></g>',
  rainhat:
    '<path d="M68 24 Q69 3 87 3 Q104 4 106 21 Z" fill="#FFC93C" stroke="#2A2140" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/><path d="M87 3 V18" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke="#E0A922" stroke-width="2.2"/><path d="M55 34 Q70 17 87 18 Q106 18 121 27 Q104 25.5 88 26.5 Q70 27.5 55 34 Z" fill="#FFC93C" stroke="#2A2140" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/><path d="M61 30.5 Q73 24 88 23.4 Q101 23.2 112 25.4" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke="#E0A922" stroke-width="2.2"/><path d="M117 9 q3.4 4.4 0 6.6 q-3.4 -2.2 0 -6.6 Z" fill="#A9DDF7" stroke="#2A2140" stroke-width="1.6" stroke-linejoin="round"/>',
  cap: '<path d="M69 21 Q68 5.5 86 5 Q104 5.5 103 21 Q86 14 69 21 Z" fill="#FFFBF0" stroke="#2A2140" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/><path d="M68.5 22 Q86 14.5 103.5 22" fill="none" stroke="#2A2140" stroke-width="7.8" stroke-linecap="round"/><path d="M68.5 22 Q86 14.5 103.5 22" fill="none" stroke="#2B3A67" stroke-width="4.4" stroke-linecap="round"/><path d="M96 19.5 Q110 18.5 115 26 Q105 23.6 97 25 Z" fill="#2A2140" stroke="#2A2140" stroke-width="2" stroke-linejoin="round"/><path d="M101 21.4 Q106 20.8 110.5 23.4" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke="#FFFBF0" stroke-width="1.4" opacity=".75"/><circle cx="86.5" cy="11" r="3.6" fill="#FFC93C" stroke="#2A2140" stroke-width="1.6"/><path d="M86.5 9 V13 M84.8 11.8 Q86.5 13.8 88.2 11.8" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke="#2A2140" stroke-width="1.1"/>',
  party:
    '<path d="M77.5 20 Q80 44 97 47.5" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke="#2A2140" stroke-width="1.3" opacity=".55"/><path d="M75 19 L89 -11 L100 18 Q88 14 75 19 Z" fill="#A98BE8" stroke="#2A2140" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/><path d="M80.4 8 L95.4 5.4 M77.6 14.4 L98.2 11.4 M84.6 -1.4 L92 -2.8" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke="#FFC93C" stroke-width="3"/><path d="M75 19 L89 -11 L100 18 Q88 14 75 19 Z" fill="none" stroke="#2A2140" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/><path d="M74.5 19.6 q3 -3 6 -.8 q3 -2.6 6.2 -.7 q3 -2.4 6.2 -.3 q3 -2 7 .5" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke="#FFFBF0" stroke-width="4.4"/><path d="M74.5 19.6 q3 -3 6 -.8 q3 -2.6 6.2 -.7 q3 -2.4 6.2 -.3 q3 -2 7 .5" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke="#2A2140" stroke-width="1.6"/><g§pom§><circle cx="89" cy="-12" r="4.6" fill="#FFC93C" stroke="#2A2140" stroke-width="2"/><path d="M84 -17 l2 2.4 M94 -17 l-2 2.4 M89 -19.5 v3" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke="#2A2140" stroke-width="1.5"/></g>',
  earmuffs:
    '<path d="M71 33 Q70 10 87 10 Q103 10 103.5 23" fill="none" stroke="#2A2140" stroke-width="6.6" stroke-linecap="round"/><path d="M71 33 Q70 10 87 10 Q103 10 103.5 23" fill="none" stroke="#FFC93C" stroke-width="3.2" stroke-linecap="round"/><circle cx="85.0" cy="37.0" r="2.7" fill="#F4623F" stroke="#2A2140" stroke-width="2.2"/><circle cx="82.9" cy="42.8" r="2.7" fill="#F4623F" stroke="#2A2140" stroke-width="2.2"/><circle cx="77.6" cy="45.9" r="2.7" fill="#F4623F" stroke="#2A2140" stroke-width="2.2"/><circle cx="71.5" cy="44.8" r="2.7" fill="#F4623F" stroke="#2A2140" stroke-width="2.2"/><circle cx="67.5" cy="40.1" r="2.7" fill="#F4623F" stroke="#2A2140" stroke-width="2.2"/><circle cx="67.5" cy="33.9" r="2.7" fill="#F4623F" stroke="#2A2140" stroke-width="2.2"/><circle cx="71.5" cy="29.2" r="2.7" fill="#F4623F" stroke="#2A2140" stroke-width="2.2"/><circle cx="77.6" cy="28.1" r="2.7" fill="#F4623F" stroke="#2A2140" stroke-width="2.2"/><circle cx="82.9" cy="31.2" r="2.7" fill="#F4623F" stroke="#2A2140" stroke-width="2.2"/><circle cx="76" cy="37" r="9.0" fill="#F4623F"/><circle cx="76" cy="37" r="5.4" fill="#D24F2E"/><path d="M72.6 34.6 Q74 32.6 76.4 32.4" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke="#FFFBF0" stroke-width="1.6" opacity=".8"/>',
  band: '<rect x="63" y="90.8" width="10" height="6.8" rx="2.6" fill="#FFC93C" stroke="#2A2140" stroke-width="2"/><path d="M65.2 93 H69" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke="#FFFBF0" stroke-width="1.5"/><path d="M65 95.4 H71" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke="#E0A922" stroke-width="1.2"/>',
  bell: '<rect x="48.4" y="89.6" width="7.2" height="3.8" rx="1.6" fill="#D99A6C" stroke="#2A2140" stroke-width="1.6"/><g§bell§><path d="M52 93.2 Q58 94.4 57.4 100.4 Q52 103 46.6 100.4 Q46 94.4 52 93.2 Z" fill="#FFC93C" stroke="#2A2140" stroke-width="2" stroke-linejoin="round"/><path d="M49.4 100 H54.6" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke="#2A2140" stroke-width="1.6"/><path d="M49 97 Q49.4 95.6 50.8 95.2" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke="#FFFBF0" stroke-width="1.4"/></g>',
  tube: '<rect x="57.5" y="87.6" width="21.5" height="10.4" rx="5.2" fill="#FFFBF0" stroke="#2A2140" stroke-width="2.2"/><path d="M57.5 92.8 a5.2 5.2 0 0 1 5.2 -5.2 h1.8 v10.4 h-1.8 a5.2 5.2 0 0 1 -5.2 -5.2 Z" fill="#FFC93C" stroke="#2A2140" stroke-width="2" stroke-linejoin="round"/><path d="M72.4 87.8 V97.8" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke="#F4623F" stroke-width="2.4"/><path d="M66.6 90.6 H70" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke="#B9B3C9" stroke-width="1.4"/>',
  booties:
    '<path d="M47 93 H57 V98 Q62 98 62.5 101.6 V103 H47 Z" fill="#FFC93C" stroke="#2A2140" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/><rect x="46.4" y="102.4" width="16.8" height="3.2" rx="1.4" fill="#FFFBF0" stroke="#2A2140" stroke-width="1.8"/><path d="M47.4 95.6 H56.6" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke="#E0A922" stroke-width="1.8"/><path d="M49.2 97.6 V100.4" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke="#FFFBF0" stroke-width="1.5"/><path d="M63 93 H73 V98 Q78 98 78.5 101.6 V103 H63 Z" fill="#FFC93C" stroke="#2A2140" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/><rect x="62.4" y="102.4" width="16.8" height="3.2" rx="1.4" fill="#FFFBF0" stroke="#2A2140" stroke-width="1.8"/><path d="M63.4 95.6 H72.6" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke="#E0A922" stroke-width="1.8"/><path d="M65.2 97.6 V100.4" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke="#FFFBF0" stroke-width="1.5"/>',
  backpack:
    '<path d="M47 44 Q62 39 77 51" fill="none" stroke="#2A2140" stroke-width="5.4" stroke-linecap="round"/><path d="M47 44 Q62 39 77 51" fill="none" stroke="#D99A6C" stroke-width="2.8" stroke-linecap="round"/><rect x="26" y="26.6" width="20" height="8" rx="4" fill="#F9C5B4" stroke="#2A2140" stroke-width="2"/><path d="M30 28.6 q2.4 2 0 4" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke="#2A2140" stroke-width="1.3"/><rect x="23" y="33" width="26" height="28" rx="8" fill="#86D9A0" stroke="#2A2140" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/><path d="M23 43 Q36 51.5 49 43 V41 Q49 33 41 33 H31 Q23 33 23 41 Z" fill="#6CC489" stroke="#2A2140" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/><rect x="33.4" y="44.6" width="5.2" height="6.4" rx="1.4" fill="#FFC93C" stroke="#2A2140" stroke-width="1.6"/><path d="M27.5 55.4 H44.5" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke="#6CC489" stroke-width="1.6" stroke-dasharray="2.4 2.4"/>',
};

const NECK: GearId[] = ["scarf", "bow", "bandana"];
const HEAD: GearId[] = ["beanie", "rainhat", "cap", "party", "earmuffs"];
const LEG: GearId[] = ["band", "bell", "tube", "booties"];

const IDLE: Motion = {
  head: "coo-headbob 4.2s ease-in-out infinite",
  tail: "coo-tail-flick 5.5s ease-in-out infinite",
  torso: "coo-breathe 1.9s ease-in-out infinite alternate",
  wing: "coo-wing-shrug 6s ease-in-out 1.4s infinite",
  blink: true,
  scarf: "coo-sway 2.6s ease-in-out infinite alternate",
  pom: "coo-sway 1.8s ease-in-out infinite alternate",
  bell: "coo-sway 1.4s ease-in-out infinite alternate",
};
const CALM: Motion = {
  torso: "coo-breathe 1.9s ease-in-out infinite alternate",
  blink: true,
  tail: "coo-tail-flick 5.5s ease-in-out 1s infinite",
};
const SLEEPING: Motion = {
  torso: "coo-sleep 2.4s ease-in-out infinite alternate",
};
const PECKING: Motion = {
  all: "coo-peck-body 1.5s ease-in-out infinite",
  head: "coo-peck-head 1.5s ease-in-out infinite",
  tail: "coo-tail-flick 3s ease-in-out infinite",
};
const HOPPING: Motion = {
  all: "coo-hop 3.2s ease-in-out infinite",
  blink: true,
  tail: "coo-tail-flick 3.2s ease-in-out infinite",
  head: "coo-headbob 4.2s ease-in-out infinite",
};
const SULKING: Motion = {
  torso: "coo-sigh 3.4s ease-in-out infinite",
  all: "coo-wobble 3.4s ease-in-out infinite",
};
const STARTLED: Motion = { tail: "coo-tail-flick 1.6s ease-in-out infinite" };
const FLYING: Motion = {
  wing: "coo-flap .34s cubic-bezier(.4,0,.6,1) infinite",
  wing2: "coo-flap .34s cubic-bezier(.4,0,.6,1) -.05s infinite",
  core: "coo-fly-core .34s ease-in-out infinite",
  tail: "coo-fly-tail .34s ease-in-out infinite",
  blink: true,
  scarf: "coo-flutter .28s ease-in-out infinite alternate",
  streak: true,
};

const OWN: Partial<Record<Look, GearId[]>> = { admiral: ["cap"] };

const PERCH_VB = "-10 -22 140 132";
const FLY_VB = "-24 -12 164 120";
const WING = "M46 55 Q32 22 62 2 Q70 8 72 20 Q80 27 78 39 Q83 47 77 58 Z";

function darken(hex: string, f = 0.84) {
  return (
    "#" +
    [1, 3, 5]
      .map((i) =>
        Math.trunc(parseInt(hex.slice(i, i + 2), 16) * f)
          .toString(16)
          .toUpperCase()
          .padStart(2, "0"),
      )
      .join("")
  );
}

function style(anim: Motion | undefined, key: Part, origin: string) {
  const a = anim?.[key];
  return a
    ? ` style="transform-box: fill-box; transform-origin: ${origin}; animation: ${a}"`
    : "";
}

function tokens(s: string, anim: Motion | undefined) {
  return s
    .replace("§scarf§", style(anim, "scarf", "50% 0%"))
    .replace("§pom§", style(anim, "pom", "50% 100%"))
    .replace("§bell§", style(anim, "bell", "50% 0%"));
}

function eyeSvg(kind: Eye, body: string) {
  const line = (d: string) =>
    `<path d="${d}" stroke="${INK}" stroke-width="${W}" fill="none" stroke-linecap="round"/>`;
  if (kind === "closed") return line("M87 31 q5 4 10 0");
  if (kind === "happy") return line("M87 33 q5 -6 10 0");
  if (kind === "wide")
    return `<circle cx="92" cy="30" r="8.5" fill="${CARD}" stroke="${INK}" stroke-width="${W}"/><circle cx="92" cy="30" r="4.4" fill="#FFB03A" stroke="${INK}" stroke-width="${(W * 0.8).toFixed(1)}"/><circle cx="92.6" cy="30" r="1.6" fill="${INK}"/>`;
  const base = `<circle cx="92" cy="30" r="6.5" fill="#FFB03A" stroke="${INK}" stroke-width="${W}"/>`;
  if (kind === "lid")
    return (
      base +
      `<circle cx="92.5" cy="32.4" r="2.4" fill="${INK}"/><path d="M85.5 30 a6.5 6.5 0 0 1 13 0 Z" fill="${body}" stroke="${INK}" stroke-width="${W}" stroke-linejoin="round"/>`
    );
  return (
    base +
    `<circle cx="93.5" cy="30" r="2.6" fill="${INK}"/><circle cx="94.6" cy="28.8" r=".9" fill="${CARD}"/>`
  );
}

type BirdOptions = {
  eye: Eye;
  gear: readonly GearId[];
  anim?: Motion;
  scroll?: boolean;
};

function bird(
  p: Palette,
  breed: string,
  { eye, gear, anim, scroll }: BirdOptions,
) {
  const { body, wing, collar } = p;
  const rx = p.rx ?? 35,
    ry = p.ry ?? 27;
  const wd = darken(wing);
  const g = (id: GearId) => (gear.includes(id) ? tokens(ON[id], anim) : "");
  const part = (key: Part, origin: string, inner: string) =>
    `<g${style(anim, key, origin)}>${inner}</g>`;

  const tail =
    breed === "fantail"
      ? `<path d="M30 76 L-6 62 Q-10 36 8 20 Q24 10 40 20 Z" fill="${wing}" ${J}/><path d="M30 74 L0 48 M30 74 L10 30 M30 74 L26 20" stroke="${INK}" stroke-width="${W}" fill="none" stroke-linecap="round"/>`
      : `<path d="M26 62 L4 52 L8 72 L24 78 Z" fill="${wing}" ${J}/><path d="M10.5 58.5 L24 67 M9.5 66 L24 72.5" stroke="${INK}" stroke-width="${T}" fill="none" stroke-linecap="round"/>`;
  const legs = `<path d="M52 86 V100 M52 100 L45.5 103.5 M52 100 L53 104.6 M52 100 L59 102.6 M68 86 V100 M68 100 L61.5 103.5 M68 100 L69 104.6 M68 100 L75 102.6" stroke="${TOMATO}" stroke-width="${SW + 0.3}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
  const feath =
    breed === "frillback"
      ? `<path d="M46 66 q4 -7 9 0 q-4 5 -7 0 M57 71 q4 -7 9 0 q-4 5 -7 0 M54 58 q4 -7 9 0 q-4 5 -7 0" stroke="${INK}" stroke-width="${W}" fill="none" stroke-linecap="round"/>`
      : `<path d="M50 70 L58 56 M60 72 L67 59" stroke="${INK}" stroke-width="${W}" stroke-linecap="round"/>`;
  const wingPart = part(
    "wing",
    "88% 20%",
    `<path d="M36 58 Q56 42 78 60 Q66 80 40 74 Z" fill="${wing}" ${J}/><path d="M40.5 73.6 Q54 80.6 67.5 73 Q58 66.6 45.5 68 Z" fill="${wd}" stroke="${INK}" stroke-width="${T}" stroke-linejoin="round"/>` +
      `${feath}<path d="M45 56.6 Q54 50.4 65 52.8" fill="none" stroke="${CARD}" stroke-width="${T}" stroke-linecap="round" opacity=".45"/>`,
  );
  const torso = part(
    "torso",
    "50% 100%",
    `<ellipse cx="56" cy="62" rx="${rx}" ry="${ry}" fill="${body}" ${S}/><ellipse cx="60" cy="72" rx="${rx - 12}" ry="${ry - 16}" fill="${CARD}" opacity=".32"/>` +
      wingPart +
      g("backpack"),
  );

  const hd: string[] = [];
  if (breed === "jacobin") {
    const hood = "#B5553C";
    for (let i = 0; i < 10; i++) {
      const a = ((36 * i + 10) * Math.PI) / 180;
      hd.push(
        `<circle cx="${(84 + 20 * Math.cos(a)).toFixed(1)}" cy="${(36 + 20 * Math.sin(a)).toFixed(1)}" r="9" fill="${hood}" ${S}/>`,
      );
    }
    hd.push(
      `<circle cx="84" cy="36" r="21" fill="${hood}"/><circle cx="88" cy="34" r="14" fill="${body}" ${S}/>`,
    );
  } else {
    hd.push(
      `<circle cx="86" cy="34" r="18" fill="${body}" ${S}/><path d="M73.6 27.4 Q77.6 19.4 86.6 18.6" fill="none" stroke="${CARD}" stroke-width="${T}" stroke-linecap="round" opacity=".55"/>`,
    );
  }
  const lens = goggleLens(gear);
  if (lens) hd.push(preGoggles(lens));
  hd.push(eyeSvg(eye, body));
  if (anim?.blink && (eye === "open" || eye === "wide"))
    hd.push(
      `<circle cx="92" cy="30" r="7.6" fill="${body}" stroke="${INK}" stroke-width="${W}" style="transform-box: fill-box; transform-origin: 50% 0%; transform: scaleY(0); animation: coo-blink 4.6s ease-in-out infinite"/>`,
    );
  hd.push(g("goggles"), g("nightgoggles"));
  hd.push(
    `<path d="M104 31 L118 36 L104 41 Z" fill="${SUN}" stroke="${INK}" stroke-width="${W}" stroke-linejoin="round"/><path d="M104.6 36 H114.6" stroke="${INK}" stroke-width="${T}" stroke-linecap="round"/>`,
  );
  hd.push(
    `<ellipse cx="104.5" cy="30.5" rx="3.4" ry="2.5" fill="${CARD}" stroke="${INK}" stroke-width="${(W * 0.8).toFixed(1)}"/>`,
  );
  if (eye !== "lid")
    hd.push(`<circle cx="84" cy="43" r="3.2" fill="${ROSE}"/>`);
  hd.push(...HEAD.map(g));
  const head = part("head", "36% 100%", hd.join(""));

  let neck = "";
  if (breed === "pouter") {
    neck = `<circle cx="92" cy="63" r="20" fill="${body}" ${S}/><path d="M82 50 Q92 45 102 50" fill="none" stroke="${INK}" stroke-width="${W}" stroke-linecap="round"/><path d="M80 58 Q84 52 90 50.6" fill="none" stroke="${CARD}" stroke-width="${T}" stroke-linecap="round" opacity=".6"/>`;
  } else if (breed !== "jacobin") {
    neck =
      `<ellipse cx="83" cy="53" rx="15" ry="7" fill="${collar}" stroke="${INK}" stroke-width="${W}"/>` +
      (p.sheen
        ? `<ellipse cx="79" cy="54" rx="6" ry="2.6" fill="${p.sheen}"/>`
        : "");
    neck += `<path d="M72 50.6 Q78 48 85 48.4" fill="none" stroke="${CARD}" stroke-width="${T}" stroke-linecap="round" opacity=".5"/>`;
  }
  neck += NECK.map(g).join("");
  let leg = LEG.map(g).join("");
  if (scroll && !gear.includes("tube"))
    leg += `<rect x="62" y="91.4" width="12.6" height="7.4" rx="2.2" fill="${CARD}" stroke="${INK}" stroke-width="2"/><path d="M65.2 91.4 V98.8" stroke="${TOMATO}" stroke-width="2"/>`;
  return part(
    "all",
    "46% 100%",
    part("tail", "100% 36%", tail) + legs + torso + head + neck + leg,
  );
}

function fly(p: Palette, gear: readonly GearId[], anim: Motion | undefined) {
  const { body, wing, collar } = p;
  const wd = darken(wing),
    wf = darken(wing, 0.72);
  const far = `<g transform="translate(13 -3)"><g><path d="${WING}" fill="${wf}" ${J}${style(anim, "wing2", "50% 97%")}/></g></g>`;
  const near =
    `<g><g${style(anim, "wing", "50% 97%")}><path d="${WING}" fill="${wing}" ${J}/><path d="M55.6 50 Q50.6 30 60.6 12 M66 52 Q63 34 70 22" fill="none" stroke="${INK}" stroke-width="${T}" stroke-linecap="round"/>` +
    `<path d="M48.6 53 Q62 60 76 55 Q70 47.6 60 46.6 Q52 46.6 48.6 53 Z" fill="${wd}" stroke="${INK}" stroke-width="${T}" stroke-linejoin="round"/></g></g>`;
  const streak = anim?.streak
    ? `<g stroke="${INK}" stroke-width="3" stroke-linecap="round" fill="none"><path d="M-6 38 H-20" style="animation: coo-streak .5s linear infinite"/><path d="M-8 60 H-18" style="animation: coo-streak .5s linear .18s infinite"/>` +
      `<path d="M-2 76 H-14" style="animation: coo-streak .5s linear .33s infinite"/></g>`
    : "";
  const tail = `<g${style(anim, "tail", "100% 50%")}><path d="M26 52 L0 41 L5 52 L-2 62 L8 61.6 L24 65 Z" fill="${wing}" ${J}/><path d="M6 52 L23 57 M9 60.4 L24 61" stroke="${INK}" stroke-width="${T}" fill="none" stroke-linecap="round"/></g>`;
  const feet =
    `<path d="M46 72 L34 80 M34 80 L29 78 M34 80 L31 84.6 M58 74 L48 83 M48 83 L43 81.6 M48 83 L45.6 87.6" stroke="${TOMATO}" stroke-width="${SW + 0.3}" stroke-linecap="round" fill="none"/>` +
    `<rect x="33" y="72.6" width="12.6" height="7.4" rx="2.2" fill="${CARD}" stroke="${INK}" stroke-width="2" transform="rotate(-36 39 76)"/>`;
  const hd = `<circle cx="96" cy="44" r="15" fill="${body}" ${S}/><path d="M85.6 38.4 Q89 31.6 96.6 31" fill="none" stroke="${CARD}" stroke-width="${T}" stroke-linecap="round" opacity=".55"/>`;
  const onHead = (inner: string) =>
    `<g transform="translate(96 44) scale(.84) translate(-86 -34)">${inner}</g>`;
  const lens = goggleLens(gear);
  const hgPre = lens ? onHead(preGoggles(lens)) : "";
  let eye = `<circle cx="101" cy="41" r="5.5" fill="#FFB03A" stroke="${INK}" stroke-width="${W}"/><circle cx="102.4" cy="41" r="2.2" fill="${INK}"/><circle cx="103.2" cy="40" r=".8" fill="${CARD}"/>`;
  if (anim?.blink)
    eye += `<circle cx="101" cy="41" r="6.4" fill="${body}" stroke="${INK}" stroke-width="${W}" style="transform-box: fill-box; transform-origin: 50% 0%; transform: scaleY(0); animation: coo-blink 3.8s ease-in-out infinite"/>`;
  const onTop: GearId[] = ["goggles", "nightgoggles", ...HEAD];
  const hg = onTop
    .filter((x) => gear.includes(x))
    .map((x) => onHead(tokens(ON[x], anim)))
    .join("");
  const beak = `<path d="M109 41 L122 45 L109 49 Z" fill="${SUN}" stroke="${INK}" stroke-width="${W}" stroke-linejoin="round"/><path d="M109.6 45 H119" stroke="${INK}" stroke-width="${T}" stroke-linecap="round"/><ellipse cx="110" cy="40.5" rx="3" ry="2.2" fill="${CARD}" stroke="${INK}" stroke-width="${(W * 0.7).toFixed(1)}"/>`;
  const collarSvg = `<ellipse cx="84" cy="55" rx="8" ry="9" fill="${collar}" stroke="${INK}" stroke-width="${W}"/>`;
  const scarf = anim?.scarf
    ? ` style="transform-box: fill-box; transform-origin: 60% 0%; animation: ${anim.scarf}"`
    : ' transform="rotate(64 78 58)"';
  const ng = NECK.filter((x) => gear.includes(x))
    .map(
      (x) =>
        `<g transform="translate(84 55) scale(.56 .95) translate(-83 -53)">${tokens(ON[x].replace("§scarf§", scarf), undefined)}</g>`,
    )
    .join("");
  const core =
    `<g${style(anim, "core", "50% 50%")}>` +
    tail +
    feet +
    `<ellipse cx="58" cy="56" rx="36" ry="19" fill="${body}" ${S}/><ellipse cx="60" cy="63" rx="24" ry="8" fill="${CARD}" opacity=".32"/>` +
    hd +
    hgPre +
    eye +
    beak +
    hg +
    collarSvg +
    ng +
    "</g>";
  return streak + far + core + near;
}

const seed = (x: number, y: number) =>
  `<ellipse cx="${x}" cy="${y}" rx="3" ry="2" fill="${SUN}" stroke="${INK}" stroke-width="1.6"/>`;
const snooze = (delay: number) =>
  ` style="transform-box: fill-box; transform-origin: 0% 100%; animation: coo-snooze 2.4s ease-out ${delay}s infinite"`;

type Draw = (
  b: (o: Omit<BirdOptions, "gear">) => string,
  animated: boolean,
  bird: { palette: Palette; gear: readonly GearId[] },
) => { viewBox: string; inner: string };

const DRAW: Record<Pose, Draw> = {
  perched: (b, animated) => ({
    viewBox: PERCH_VB,
    inner: b({ eye: "open", anim: animated ? IDLE : undefined }),
  }),
  sleep: (b, animated) => {
    const z = (d: number) => (animated ? snooze(d) : "");
    return {
      viewBox: PERCH_VB,
      inner:
        b({ eye: "closed", anim: animated ? SLEEPING : undefined }) +
        `<text x="110" y="8" font-family="Nunito, sans-serif" font-weight="900" font-size="15" fill="${INK}"${z(0)}>z</text>` +
        `<text x="119" y="-3" font-family="Nunito, sans-serif" font-weight="900" font-size="11" fill="${INK}"${z(0.8)}>z</text>`,
    };
  },
  eat: (b, animated) =>
    animated
      ? {
          viewBox: "-10 -22 160 132",
          inner:
            b({ eye: "happy", anim: PECKING }) +
            [
              [120, 103],
              [128, 101],
              [136, 104],
              [112, 105],
            ]
              .map(([x, y]) => seed(x, y))
              .join(""),
        }
      : {
          viewBox: "-10 -22 170 132",
          inner:
            `<g transform="rotate(30 60 101)">${b({ eye: "happy" })}</g>` +
            [
              [126, 101],
              [136, 103],
              [144, 100],
            ]
              .map(([x, y]) => seed(x, y))
              .join(""),
        },
  sulk: (b, animated) => ({
    viewBox: PERCH_VB,
    inner:
      b({ eye: "lid", anim: animated ? SULKING : undefined }) +
      `<path d="M92 -4 q-6 -1 -5 -7 q1 -6 8 -5 q4 -6 11 -3 q7 -1 8 6 q5 1 4 6 q-1 4 -6 4 z" fill="${LILAC}" stroke="${INK}" stroke-width="2"/><path d="M96 2 l-2 5 M104 2 l-2 5 M112 2 l-2 5" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`,
  }),
  surprise: (b, animated) => ({
    viewBox: PERCH_VB,
    inner:
      b({ eye: "wide", anim: animated ? STARTLED : undefined }) +
      `<path d="M112 14 L120 4 M116 22 L126 18 M104 8 L106 -4" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>`,
  }),
  crouch: (b) => ({
    viewBox: PERCH_VB,
    inner: `<g transform="translate(-6 17) scale(1.1 .84)">${b({ eye: "open" })}</g>`,
  }),
  landed: (b, animated) => ({
    viewBox: PERCH_VB,
    inner:
      b({ eye: "open", scroll: true, anim: animated ? HOPPING : undefined }) +
      (animated
        ? ""
        : `<path d="M30 105 H20 M100 105 H112 M26 97 L18 93" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`),
  }),
  proud: (b, animated) => ({
    viewBox: PERCH_VB,
    inner:
      `<g transform="rotate(-6 60 101)">${b({ eye: "happy", anim: animated ? CALM : undefined })}</g>` +
      `<path d="M112 6 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 l5 -2 z" fill="${SUN}" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>`,
  }),
  fly: (_b, animated, { palette, gear }) => ({
    viewBox: FLY_VB,
    inner: fly(palette, gear, animated ? FLYING : undefined),
  }),
};

export function drawPose(
  look: Look,
  pose: Pose,
  {
    gear = [],
    breed,
    animated = true,
  }: { gear?: readonly GearId[]; breed?: Breed; animated?: boolean } = {},
) {
  const palette: Palette = birds[look];
  const shape = breed ?? palette.breed ?? "city";
  const worn = [...gear, ...(OWN[look] ?? [])];
  return DRAW[pose](
    (o) => bird(palette, shape, { ...o, gear: worn }),
    animated,
    { palette, gear: worn },
  );
}

export type BirdProps = {
  look: Look;
  breed?: Breed;
  pose?: Pose;
  gear?: readonly GearId[];
  animated?: boolean;
  size?: number;
  title?: string;
  flip?: boolean;
};

export function Bird({
  look,
  breed,
  pose = "perched",
  gear = [],
  animated = true,
  size = 140,
  title,
  flip,
}: BirdProps) {
  const { viewBox, inner } = drawPose(look, pose, { gear, breed, animated });
  const [, , vw, vh] = viewBox.split(" ").map(Number);
  const a11y = title
    ? { role: "img", "aria-label": title }
    : { "aria-hidden": true };
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={viewBox}
      width={size}
      height={Math.round((size * vh) / vw)}
      {...a11y}
      style={{
        display: "block",
        flexShrink: 0,
        overflow: "visible",
        transform: flip ? "scaleX(-1)" : undefined,
      }}
      dangerouslySetInnerHTML={{ __html: inner }}
    />
  );
}
