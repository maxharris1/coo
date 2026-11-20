import { config } from "@/lib/config";
import { hash32, rng } from "@/lib/flight/engine";
import { breedIds, type BreedId } from "@/lib/game/types";

export type Hatchling = {
  breed: BreedId;
  speedMph: number;
  focus: number;
  navigation: number;
};

type Breed = (typeof config.breeds.breeds)[number];

const knownBreeds: readonly string[] = breedIds;
const hatchable = config.breeds.breeds.filter(
  (b): b is Breed & { id: BreedId } =>
    b.hatchable && knownBreeds.includes(b.id),
);

export function rollHatchling(
  eggId: string,
  ownedBreeds: readonly BreedId[],
): Hatchling {
  const r = rng(hash32("egg:" + eggId));
  const unowned = hatchable.filter((b) => !ownedBreeds.includes(b.id));
  const pool = unowned.length > 0 ? unowned : hatchable;
  const breed = pool[Math.floor(r() * pool.length)];
  const roll = ([lo, hi]: number[]) => lo + Math.floor(r() * (hi - lo + 1));
  return {
    breed: breed.id,
    speedMph: roll(breed.speedMph),
    focus: roll(breed.focus),
    navigation: roll(breed.navigation),
  };
}
