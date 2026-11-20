import type { GeoName } from "@/server/ports/geocoder";

export function roostLabel(name: GeoName): string | null {
  return name.neighbourhood ?? name.suburb ?? name.city ?? null;
}

export function cityLabel(name: GeoName): string | null {
  if (!name.city) return null;
  const qualifier = name.countryCode === "US" ? name.stateCode : name.country;
  return qualifier ? `${name.city}, ${qualifier}` : name.city;
}
