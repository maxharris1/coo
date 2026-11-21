import type { GeoHit, GeoName, Geocoder } from "@/server/ports/geocoder";

const MAX_HITS = 6;
const REVERSE_RADIUS_DEG = 0.05;
const US = { country: "United States", countryCode: "US" };

function usTown(
  label: string,
  lat: number,
  lon: number,
  stateCode: string,
  state: string,
): { hit: GeoHit; name: GeoName } {
  return {
    hit: {
      label,
      sublabel: `${stateCode}, United States`,
      kind: "city",
      lat,
      lon,
      city: label,
      region: stateCode,
      ...US,
    },
    name: { city: label, state, stateCode, ...US },
  };
}

const PLACES: { hit: GeoHit; name: GeoName }[] = [
  {
    hit: {
      label: "East Village",
      sublabel: "New York, NY",
      kind: "neighbourhood",
      lat: 40.7306,
      lon: -73.9866,
      city: "New York",
      region: "NY",
      ...US,
    },
    name: {
      neighbourhood: "East Village",
      suburb: "Manhattan",
      city: "New York",
      state: "New York",
      stateCode: "NY",
      ...US,
    },
  },
  {
    hit: {
      label: "Williamsburg",
      sublabel: "Brooklyn, New York, NY",
      kind: "neighbourhood",
      lat: 40.7081,
      lon: -73.9571,
      city: "New York",
      region: "NY",
      ...US,
    },
    name: {
      neighbourhood: "Williamsburg",
      suburb: "Brooklyn",
      city: "New York",
      state: "New York",
      stateCode: "NY",
      ...US,
    },
  },
  {
    hit: {
      label: "Fishtown",
      sublabel: "Philadelphia, PA",
      kind: "neighbourhood",
      lat: 39.9713,
      lon: -75.1338,
      city: "Philadelphia",
      region: "PA",
      ...US,
    },
    name: {
      neighbourhood: "Fishtown",
      city: "Philadelphia",
      state: "Pennsylvania",
      stateCode: "PA",
      ...US,
    },
  },
  {
    hit: {
      label: "Back Bay",
      sublabel: "Boston, MA",
      kind: "neighbourhood",
      lat: 42.3503,
      lon: -71.081,
      city: "Boston",
      region: "MA",
      ...US,
    },
    name: {
      neighbourhood: "Back Bay",
      city: "Boston",
      state: "Massachusetts",
      stateCode: "MA",
      ...US,
    },
  },
  {
    hit: {
      label: "Wicker Park",
      sublabel: "Chicago, IL",
      kind: "neighbourhood",
      lat: 41.9088,
      lon: -87.6776,
      city: "Chicago",
      region: "IL",
      ...US,
    },
    name: {
      neighbourhood: "Wicker Park",
      city: "Chicago",
      state: "Illinois",
      stateCode: "IL",
      ...US,
    },
  },
  {
    hit: {
      label: "New York",
      sublabel: "NY, United States",
      kind: "city",
      lat: 40.7128,
      lon: -74.006,
      city: "New York",
      region: "NY",
      ...US,
    },
    name: {
      city: "New York",
      state: "New York",
      stateCode: "NY",
      ...US,
    },
  },
  {
    hit: {
      label: "Philadelphia",
      sublabel: "PA, United States",
      kind: "city",
      lat: 39.9526,
      lon: -75.1652,
      city: "Philadelphia",
      region: "PA",
      ...US,
    },
    name: {
      city: "Philadelphia",
      state: "Pennsylvania",
      stateCode: "PA",
      ...US,
    },
  },
  {
    hit: {
      label: "Boston",
      sublabel: "MA, United States",
      kind: "city",
      lat: 42.3601,
      lon: -71.0589,
      city: "Boston",
      region: "MA",
      ...US,
    },
    name: {
      city: "Boston",
      state: "Massachusetts",
      stateCode: "MA",
      ...US,
    },
  },
  {
    hit: {
      label: "Chicago",
      sublabel: "IL, United States",
      kind: "city",
      lat: 41.8781,
      lon: -87.6298,
      city: "Chicago",
      region: "IL",
      ...US,
    },
    name: { city: "Chicago", state: "Illinois", stateCode: "IL", ...US },
  },
  {
    hit: {
      label: "Los Angeles",
      sublabel: "CA, United States",
      kind: "city",
      lat: 34.0522,
      lon: -118.2437,
      city: "Los Angeles",
      region: "CA",
      ...US,
    },
    name: {
      city: "Los Angeles",
      state: "California",
      stateCode: "CA",
      ...US,
    },
  },
  usTown("Bayonne", 40.66, -74.11, "NJ", "New Jersey"),
  usTown("Carteret", 40.58, -74.23, "NJ", "New Jersey"),
  usTown("Sayreville", 40.48, -74.35, "NJ", "New Jersey"),
  usTown("Milltown", 40.44, -74.44, "NJ", "New Jersey"),
  usTown("Plainsboro", 40.33, -74.59, "NJ", "New Jersey"),
  usTown("Lawrenceville", 40.28, -74.71, "NJ", "New Jersey"),
  usTown("Levittown", 40.17, -74.83, "PA", "Pennsylvania"),
  usTown("Bensalem", 40.10, -74.95, "PA", "Pennsylvania"),
  usTown("Palmyra", 40.01, -75.03, "NJ", "New Jersey"),
];

export class FakeGeocoder implements Geocoder {
  async search(q: string): Promise<GeoHit[]> {
    const needle = q.split(",")[0].trim().toLowerCase();
    return PLACES.filter(({ hit }) => hit.label.toLowerCase().includes(needle))
      .slice(0, MAX_HITS)
      .map(({ hit }) => structuredClone(hit));
  }

  async reverse(lat: number, lon: number): Promise<GeoName | null> {
    let nearest: { name: GeoName; distance: number } | null = null;
    for (const { hit, name } of PLACES) {
      const distance = Math.hypot(hit.lat - lat, hit.lon - lon);
      if (
        distance <= REVERSE_RADIUS_DEG &&
        (!nearest || distance < nearest.distance)
      ) {
        nearest = { name, distance };
      }
    }
    return nearest ? structuredClone(nearest.name) : null;
  }
}
