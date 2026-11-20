import motion from "../../public/assets/motion.json";
import { Bird, type Breed, type GearId, type Look } from "./Bird";

type Flight = {
  perch: string;
  fly: string;
  duration: string;
  size: number;
  perchOpacity?: number;
};

type FlightProps = {
  look: Look;
  breed?: Breed;
  gear?: readonly GearId[];
  size?: number;
  title?: string;
};

const TAKEOFF_DURATION = "2.5s";
const ITERATIONS_UNTIL_LOOP_RESET_FRAME = 0.94;

const motionDuration = (name: string) =>
  motion.keyframes.find((k) => k.name === name)!.duration;

const FLIGHTS = {
  takeoff: {
    perch: "coo-takeoff-crouch",
    fly: "coo-takeoff-fly",
    duration: TAKEOFF_DURATION,
    size: 160,
    perchOpacity: 0,
  },
  landing: {
    perch: "coo-land-perch",
    fly: "coo-land-fly",
    duration: motionDuration("coo-land-perch"),
    size: 150,
  },
} satisfies Record<"takeoff" | "landing", Flight>;

function FlightSprites({
  flight,
  look,
  breed,
  gear,
  size = flight.size,
  title,
}: FlightProps & { flight: Flight }) {
  const play = (name: string) =>
    `${name} ${flight.duration} linear ${ITERATIONS_UNTIL_LOOP_RESET_FRAME} forwards`;
  return (
    <div style={{ position: "relative", width: size }}>
      <div
        style={{
          transformOrigin: "46% 100%",
          opacity: flight.perchOpacity,
          animation: play(flight.perch),
        }}
      >
        <Bird
          look={look}
          breed={breed}
          gear={gear}
          pose="landed"
          animated
          size={size}
          title={title}
        />
      </div>
      <div
        style={{
          position: "absolute",
          left: -Math.round(size * 0.08),
          bottom: Math.round(size * 0.1),
          transformOrigin: "50% 60%",
          opacity: 0,
          animation: play(flight.fly),
        }}
      >
        <Bird
          look={look}
          breed={breed}
          gear={gear}
          pose="fly"
          size={Math.round(size * 1.12)}
        />
      </div>
    </div>
  );
}

export function Takeoff(props: FlightProps) {
  return <FlightSprites flight={FLIGHTS.takeoff} {...props} />;
}

export function Landing(props: FlightProps) {
  return <FlightSprites flight={FLIGHTS.landing} {...props} />;
}
