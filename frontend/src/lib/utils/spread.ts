import { bandFromSum } from "@/lib/constants/severity";
import type { FireWeather, Incident } from "@/lib/types";

/**
 * Indicative fire spread envelope: how far a fire at a point could run in a few hours if nothing
 * stopped it, from the weather and the image's fuel reading. Deliberately simple and labelled as
 * such in the UI; it is not a fire behaviour forecast (no terrain, fuel maps or wind change).
 *
 * - Rate of spread: McArthur Mk5 forest meter, R = 0.0012 x FFDI x fuel load (km/h).
 * - Shape: an ellipse with the ignition point at its rear focus (Van Wagner 1969), stretched
 *   downwind by Alexander's (1985) length-to-breadth ratio for the wind speed.
 */

// Same scale and bands as backend/src/pipeline/fire-weather.ts.
export const SEVERE_FFDI = 50;

export function dangerRating(ffdi: number): string {
  if (ffdi >= 100) return "Catastrophic";
  if (ffdi >= 75) return "Extreme";
  if (ffdi >= 50) return "Severe";
  if (ffdi >= 25) return "Very high";
  if (ffdi >= 12) return "High";
  return "Low-moderate";
}

/** The AI's band sits above what the image alone scored: fire danger raised it (backend
 * assess-severity.ts applyFireDanger). */
export function raisedByFireDanger(incident: Incident): boolean {
  return incident.provenance === "ai_classified" && incident.sum != null && incident.band > bandFromSum(incident.sum);
}

// ponytail: fuel load (t/ha) guessed from the image's vegetation level 1-4. Swap for a fuel-type
// map (e.g. Victorian fuel hazard layers) if the envelope ever needs to be more than indicative.
const FUEL_LOAD_T_HA: Record<number, number> = { 1: 2, 2: 5, 3: 12, 4: 25 };

export function spreadRateKmh(ffdi: number, vegetationLevel: number): number {
  return 0.0012 * ffdi * (FUEL_LOAD_T_HA[vegetationLevel] ?? 0);
}

export function lengthToBreadth(windKmh: number): number {
  return 1 + 8.729 * (1 - Math.exp(-0.03 * windKmh)) ** 2.155;
}

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
export function compass(deg: number): string {
  return COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

const KM_PER_DEG_LAT = 111.32;

/** Outline of the area the fire could reach after `hours`, as [lat, lng] points; null if it
 * can't spread (no fuel reading or no rate). */
export function spreadEllipse(
  origin: { lat: number; lng: number },
  weather: FireWeather,
  vegetationLevel: number | null,
  hours: number,
  points = 48
): [number, number][] | null {
  const head = spreadRateKmh(weather.ffdi, vegetationLevel ?? 0) * hours; // km, ignition to head
  if (!(head > 0)) return null;
  const lb = lengthToBreadth(weather.windKmh);
  const e = Math.sqrt(1 - 1 / lb ** 2);
  const a = head / (1 + e); // semi-major
  const b = a / lb; // semi-minor
  const c = a * e; // ignition (rear focus) to centre

  const toward = (((weather.windFromDeg + 180) % 360) * Math.PI) / 180; // fire runs downwind
  const kmPerDegLng = KM_PER_DEG_LAT * Math.cos((origin.lat * Math.PI) / 180);
  const outline: [number, number][] = [];
  for (let i = 0; i < points; i++) {
    const t = (2 * Math.PI * i) / points;
    const along = c + a * Math.cos(t); // km downwind of the ignition point
    const across = b * Math.sin(t); // km to the right of the wind
    const north = along * Math.cos(toward) - across * Math.sin(toward);
    const east = along * Math.sin(toward) + across * Math.cos(toward);
    outline.push([origin.lat + north / KM_PER_DEG_LAT, origin.lng + east / kmPerDegLng]);
  }
  return outline;
}
