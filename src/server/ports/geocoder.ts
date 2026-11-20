export interface GeoHit {
  label: string;
  sublabel: string;
  kind: "neighbourhood" | "city" | "address";
  lat: number;
  lon: number;
  city?: string;
  region?: string;
  country?: string;
  countryCode?: string;
}

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
