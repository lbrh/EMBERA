import { bandFromSum } from "@/lib/constants/severity";
import type { FireWeather, Incident } from "@/lib/types";

/**
 * Indicative fire spread envelope: how far a fire at a point could run in a few hours if nothing
 * stopped it, from the weather and the image's fuel reading. Deliberately simple and labelled as
 * such in the UI; it is not a fire behaviour forecast (no terrain, fuel maps or ember spotting).
 *
 * - Rate of spread: McArthur Mk5 forest meter, R = 0.0012 x FFDI x fuel load (km/h) (Noble et al.
 *   1980), times a bias correction fitted on Black Summer satellite data, and floored by Cruz &
 *   Alexander's (2019) 10% wind speed rule on windy, dry days (see docs/live/spread-backtest.md).
 * - Shape: an ellipse with the ignition point at its rear focus (Van Wagner 1969), stretched
 *   downwind by Alexander's (1985) length-to-breadth ratio for the wind speed.
 */

// Same scale and bands as backend/src/pipeline/fire-weather.ts.
export const SEVERE_FFDI = 50;

/** The FFDI's band on the legacy (pre-September 2022) McArthur scale. Not an AFDRS rating: those
 * come from the Fire Behaviour Index, which this app doesn't compute. Always show it labelled as legacy. */
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

/** Fine dead fuel moisture (%), Gould et al. (2007) peak-burning equation as tabled in the Vesta
 * Mk 2 guide (Table M1). ponytail: afternoon equation at every hour, so night-time moisture reads
 * low; use the Table M2 night equation too if overnight envelopes matter. */
export function fineFuelMoisturePct(temperatureC: number, humidityPct: number): number {
  return 2.76 + 0.124 * humidityPct - 0.0187 * temperatureC;
}

// Cruz & Alexander (2019): in forest and shrubland with open wind over 30 km/h and fine fuel under
// 7% moisture, a wildfire runs at about 10% of the wind speed. Not valid for grassland, so it only
// applies where the image shows moderate or dense vegetation.
const TEN_PERCENT_RULE = { minWindKmh: 30, maxMoisturePct: 7, minVegetationLevel: 3 };

// Mk5 underpredicts wildfire spread (CSIRO: 2-3x). Fitted on 140 December 2019 VIIRS fire runs
// (geometric-mean bias 1/2.45 at dense fuel) and checked on 513 held-out January 2020 runs, where
// the median predicted/observed went from 0.54 to 1.31. Rounded to 2.5. Refit with
// scripts/spread-backtest.ts if the weather source or fuel mapping changes.
export const MK5_BIAS_CORRECTION = 2.5;

type RateInputs = Pick<FireWeather, "ffdi" | "windKmh" | "temperatureC" | "humidityPct">;

export function spreadRateKmh(hour: RateInputs, vegetationLevel: number): number {
  const mcArthur = MK5_BIAS_CORRECTION * 0.0012 * hour.ffdi * (FUEL_LOAD_T_HA[vegetationLevel] ?? 0);
  const rule = TEN_PERCENT_RULE;
  const ruleApplies =
    vegetationLevel >= rule.minVegetationLevel &&
    hour.windKmh > rule.minWindKmh &&
    fineFuelMoisturePct(hour.temperatureC, hour.humidityPct) < rule.maxMoisturePct;
  return ruleApplies ? Math.max(mcArthur, 0.1 * hour.windKmh) : mcArthur;
}

export function lengthToBreadth(windKmh: number): number {
  return 1 + 8.729 * (1 - Math.exp(-0.03 * windKmh)) ** 2.155;
}

/** Where the current conditions came from, for display. */
export function weatherSource(weather: FireWeather): string {
  return weather.station ? `BoM ${weather.station.name} station, ${Math.round(weather.station.distanceKm)} km away` : "forecast model (no station nearby)";
}

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
export function compass(deg: number): string {
  return COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

const KM_PER_DEG_LAT = 111.32;
type Km = [east: number, north: number];
type HourConditions = Pick<FireWeather, "ffdi" | "windKmh" | "windFromDeg" | "temperatureC" | "humidityPct">;

/** One hour's growth from a single burning point (at the ellipse's rear focus), in km. */
function hourEllipse(hour: HourConditions, vegetationLevel: number, points: number): Km[] | null {
  const head = spreadRateKmh(hour, vegetationLevel); // km in one hour, point to head
  if (!(head > 0)) return null;
  const lb = lengthToBreadth(hour.windKmh);
  const e = Math.sqrt(1 - 1 / lb ** 2);
  const a = head / (1 + e); // semi-major
  const b = a / lb; // semi-minor
  const c = a * e; // burning point (rear focus) to centre
  const toward = (((hour.windFromDeg + 180) % 360) * Math.PI) / 180; // fire runs downwind
  return Array.from({ length: points }, (_, i) => {
    const t = (2 * Math.PI * i) / points;
    const along = c + a * Math.cos(t); // downwind
    const across = b * Math.sin(t); // right of the wind
    return [along * Math.sin(toward) + across * Math.cos(toward), along * Math.cos(toward) - across * Math.sin(toward)];
  });
}

/** Convex hull (Andrew's monotone chain). */
function hull(points: Km[]): Km[] {
  const sorted = [...points].sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const cross = (o: Km, a: Km, b: Km) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (pts: Km[]) => {
    const out: Km[] = [];
    for (const p of pts) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    return out.slice(0, -1);
  };
  return [...half(sorted), ...half(sorted.reverse())];
}

/** Wind and danger for each hour of the envelope: now, then the stored forecast hours, holding the
 * last known hour if the forecast is shorter (or missing, on rows stored before it existed). */
export function spreadHours(weather: FireWeather, hours = 3): HourConditions[] {
  const known = [weather, ...(weather.nextHours ?? [])];
  return Array.from({ length: hours }, (_, h) => known[Math.min(h, known.length - 1)]);
}

/**
 * Outlines of the area the fire could reach after 1, 2 ... `hours` hours, as [lat, lng] rings;
 * null if it can't spread (no fuel reading). Each hour every point on the edge grows its own
 * one-hour ellipse under that hour's wind, and the new edge is their outer boundary (Huygens'
 * principle, as in Phoenix/FARSITE). A steady wind gives one clean ellipse; a wind change bends it.
 */
// ponytail: convex hull, so a fire can't wrap around into a concave (L-shaped) front; fine over 3 h
// of one wind change, swap for a proper perimeter union if longer horizons are ever drawn.
export function spreadPerimeters(
  origin: { lat: number; lng: number },
  weather: FireWeather,
  vegetationLevel: number | null,
  hours = 3,
  points = 48
): [number, number][][] | null {
  const kmPerDegLng = KM_PER_DEG_LAT * Math.cos((origin.lat * Math.PI) / 180);
  let edge: Km[] = [[0, 0]];
  const rings: [number, number][][] = [];
  for (const hour of spreadHours(weather, hours)) {
    const growth = hourEllipse(hour, vegetationLevel ?? 0, points);
    if (!growth) return null;
    edge = hull(edge.flatMap(([x, y]) => growth.map(([dx, dy]): Km => [x + dx, y + dy])));
    rings.push(edge.map(([east, north]) => [origin.lat + north / KM_PER_DEG_LAT, origin.lng + east / kmPerDegLng]));
  }
  return rings;
}
