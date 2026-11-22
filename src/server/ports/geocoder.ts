interface GeoHitBase {
  label: string;
  sublabel: string;
  lat: number;
  lon: number;
  city?: string;
  region?: string;
  country?: string;
  countryCode?: string;
}

export type GeoHit =
  | (GeoHitBase & { kind: "neighbourhood" | "city" })
  | (GeoHitBase & { kind: "address"; area: GeoName });

export interface GeoName {
  neighbourhood?: string;
  suburb?: string;
  city?: string;
  state?: string;
  stateCode?: string;
  country?: string;
  countryCode?: string;
}

export interface Geocoder {
  search(q: string): Promise<GeoHit[]>;
  reverse(lat: number, lon: number): Promise<GeoName | null>;
}
