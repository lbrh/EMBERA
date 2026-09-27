// Backtests the map's spread envelope (src/lib/utils/spread.ts) against real fire runs: VIIRS
// satellite fire detections (NASA FIRMS) from Victoria's 2019-20 Black Summer, with hourly ERA5
// weather from Open-Meteo's archive. Results are written up in docs/live/spread-backtest.md.
//
//   node scripts/spread-backtest.ts <firms.csv> [samples-out.csv]
//
// <firms.csv> is FIRMS' public country file (firms.modaps.eosdis.nasa.gov/data/country/), already
// cut down to the area and dates of interest. Method, per pair of consecutive satellite overpasses
// 6-16 h apart:
//   1. Group the later pass's fire pixels into fires (pixels within 1.5 km link up).
//   2. For each pixel, the distance to the nearest pixel burning at the earlier pass is how far the
//      fire edge moved there. The 95th percentile over the fire is its observed front advance
//      (not the max, so one stray pixel or spot fire doesn't set it). Runs under 1.5 km are
//      dropped as too close to the 375 m pixel size to measure.
//   3. The model grows a fire from that edge hour by hour with the archived weather, exactly as the
//      map does; its predicted advance is the farthest point of the grown shape.
import { register } from "node:module";
import { writeFileSync, readFileSync } from "node:fs";

// Resolve the app's "@/..." import alias (tsconfig paths) so the real spread code runs as-is.
register(
  "data:text/javascript," +
    encodeURIComponent(
      `export async function resolve(s, c, next) {
        return s.startsWith("@/") ? next(new URL("../src/" + s.slice(2) + ".ts", ${JSON.stringify(import.meta.url)}).href, c) : next(s, c);
      }`
    )
);
const { spreadPerimeters } = await import("../src/lib/utils/spread.ts");
const { distanceKm } = await import("../src/lib/utils/geo.ts");
const { forestFireDangerIndex } = await import("../../backend/src/pipeline/fire-weather.ts");
type FireWeather = import("../src/lib/types.ts").FireWeather;

const [csvPath, samplesOut] = process.argv.slice(2);
if (!csvPath) throw new Error("usage: node scripts/spread-backtest.ts <firms.csv> [samples-out.csv]");

const HOUR = 3_600_000;
const PASS_GAP_H = 3; // detections closer than this belong to one overpass window
const MIN_DT_H = 6;
const MAX_DT_H = 16;
const LINK_KM = 1.5;
const MAX_SEARCH_KM = 30;
const MIN_ADVANCE_KM = 1.5;
const MIN_PIXELS = 10;
const VEGETATION_LEVELS = [4, 3]; // dense (25 t/ha) and moderate (12 t/ha) forest fuel

interface Pixel { lat: number; lng: number; t: number }

// ---- detections -> overpass windows ----
const rows = readFileSync(csvPath, "utf8").trim().split("\n");
const header = rows[0].split(",");
const col = (name: string) => header.indexOf(name);
const [iLat, iLon, iDate, iTime] = ["latitude", "longitude", "acq_date", "acq_time"].map(col);
const pixels: Pixel[] = rows.slice(1).map((line) => {
  const f = line.split(",");
  const hhmm = f[iTime].padStart(4, "0");
  return { lat: +f[iLat], lng: +f[iLon], t: Date.parse(`${f[iDate]}T${hhmm.slice(0, 2)}:${hhmm.slice(2)}:00Z`) };
});
pixels.sort((a, b) => a.t - b.t);

const windows: { t: number; pixels: Pixel[] }[] = [];
for (const p of pixels) {
  const last = windows[windows.length - 1];
  if (last && p.t - last.pixels[last.pixels.length - 1].t <= PASS_GAP_H * HOUR) last.pixels.push(p);
  else windows.push({ t: 0, pixels: [p] });
}
for (const w of windows) w.t = w.pixels[Math.floor(w.pixels.length / 2)].t;

// ---- spatial index: 0.05 deg buckets ----
const CELL = 0.05;
const key = (lat: number, lng: number) => `${Math.floor(lat / CELL)},${Math.floor(lng / CELL)}`;
function index(ps: Pixel[]) {
  const m = new Map<string, Pixel[]>();
  for (const p of ps) {
    const k = key(p.lat, p.lng);
    (m.get(k) ?? m.set(k, []).get(k)!).push(p);
  }
  return m;
}
function nearby(idx: Map<string, Pixel[]>, p: Pixel, rings: number): Pixel[] {
  const [ci, cj] = [Math.floor(p.lat / CELL), Math.floor(p.lng / CELL)];
  const out: Pixel[] = [];
  for (let i = ci - rings; i <= ci + rings; i++)
    for (let j = cj - rings; j <= cj + rings; j++) out.push(...(idx.get(`${i},${j}`) ?? []));
  return out;
}
const km = (a: Pixel, b: Pixel) => distanceKm({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng });
function nearest(idx: Map<string, Pixel[]>, p: Pixel): { q: Pixel; d: number } | null {
  let best: { q: Pixel; d: number } | null = null;
  // widen the search one ring (~5 km) at a time until something is found
  for (let rings = 1; rings <= Math.ceil(MAX_SEARCH_KM / 5) + 1; rings++) {
    for (const q of nearby(idx, p, rings)) {
      const d = km(p, q);
      if (d <= MAX_SEARCH_KM && (!best || d < best.d)) best = { q, d };
    }
    if (best && best.d <= rings * 4) return best; // closer than the ring's inner reach: final
  }
  return best;
}

function clusters(ps: Pixel[]): Pixel[][] {
  const idx = index(ps);
  const seen = new Set<Pixel>();
  const out: Pixel[][] = [];
  for (const start of ps) {
    if (seen.has(start)) continue;
    const group = [start];
    seen.add(start);
    for (let i = 0; i < group.length; i++)
      for (const q of nearby(idx, group[i], 1))
        if (!seen.has(q) && km(group[i], q) <= LINK_KM) {
          seen.add(q);
          group.push(q);
        }
    out.push(group);
  }
  return out;
}

// ---- archived hourly weather (ERA5 via Open-Meteo), cached per 0.25 deg cell ----
type Hourly = { time: number[]; temperatureC: number[]; humidityPct: number[]; windKmh: number[]; windFromDeg: number[] };
const weatherCache = new Map<string, Promise<Hourly>>();
function archive(lat: number, lng: number): Promise<Hourly> {
  const [la, lo] = [Math.round(lat * 4) / 4, Math.round(lng * 4) / 4];
  const k = `${la},${lo}`;
  if (!weatherCache.has(k)) {
    const start = new Date(pixels[0].t - 2 * 86_400_000).toISOString().slice(0, 10);
    const end = new Date(pixels[pixels.length - 1].t + 2 * 86_400_000).toISOString().slice(0, 10);
    const url =
      `https://archive-api.open-meteo.com/v1/archive?latitude=${la}&longitude=${lo}&start_date=${start}&end_date=${end}` +
      `&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m&timezone=UTC&wind_speed_unit=kmh`;
    weatherCache.set(
      k,
      fetch(url)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Open-Meteo archive ${r.status}`))))
        .then(({ hourly: h }) => ({
          time: h.time.map((t: string) => Date.parse(`${t}:00Z`)),
          temperatureC: h.temperature_2m,
          humidityPct: h.relative_humidity_2m,
          windKmh: h.wind_speed_10m,
          windFromDeg: h.wind_direction_10m,
        }))
    );
  }
  return weatherCache.get(k)!;
}

/** The archived hours from `from` for `hours` hours, as the FireWeather shape the map uses. */
function weatherFor(h: Hourly, from: number, hours: number, dryFuelRule: boolean): FireWeather {
  const i0 = h.time.findIndex((t) => t >= from - HOUR / 2);
  const hourAt = (i: number) => {
    const c = { temperatureC: h.temperatureC[i], humidityPct: h.humidityPct[i], windKmh: h.windKmh[i], windFromDeg: h.windFromDeg[i] };
    const ffdi = forestFireDangerIndex(c.temperatureC, c.humidityPct, c.windKmh);
    // FFDI keeps the real humidity; 100% humidity only in the moisture test switches the 10% rule off
    return { ...c, ffdi, humidityPct: dryFuelRule ? c.humidityPct : 100 };
  };
  const [first, ...rest] = Array.from({ length: hours }, (_, n) => hourAt(i0 + n));
  return { observedAt: "", ...first, nextHours: rest.map((c) => ({ time: "", ...c })) };
}

function bearing(from: Pixel, to: Pixel): number {
  const y = (to.lng - from.lng) * Math.cos((from.lat * Math.PI) / 180);
  return ((Math.atan2(y, to.lat - from.lat) * 180) / Math.PI + 360) % 360;
}
const angleBetween = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
const percentile = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))];

function predicted(origin: Pixel, w: FireWeather, vegetation: number, hours: number) {
  const ring = spreadPerimeters({ lat: origin.lat, lng: origin.lng }, w, vegetation, hours, 24)!.at(-1)!;
  const head = ring
    .map(([lat, lng]) => ({ lat, lng, t: 0 }))
    .reduce((far, p) => (km(origin, p) > km(origin, far) ? p : far));
  return { advanceKm: km(origin, head), bearing: bearing(origin, head) };
}

// ---- samples ----
interface Sample {
  start: string;
  hours: number;
  lat: number;
  lng: number;
  pixels: number;
  observedKm: number;
  observedBearing: number;
  meanWindKmh: number;
  maxFfdi: number;
  [variant: string]: number | string;
}
const samples: Sample[] = [];
for (let w = 1; w < windows.length; w++) {
  const [A, B] = [windows[w - 1], windows[w]];
  const dtH = (B.t - A.t) / HOUR;
  if (dtH < MIN_DT_H || dtH > MAX_DT_H) continue;
  const idxA = index(A.pixels);
  for (const fire of clusters(B.pixels)) {
    if (fire.length < MIN_PIXELS) continue;
    const moves = fire.map((p) => ({ p, n: nearest(idxA, p) })).filter((m) => m.n !== null) as { p: Pixel; n: { q: Pixel; d: number } }[];
    if (moves.length < fire.length / 2) continue; // mostly new or unseen at the earlier pass
    const observedKm = percentile(moves.map((m) => m.n.d), 0.95);
    if (observedKm < MIN_ADVANCE_KM) continue;
    const front = moves.filter((m) => m.n.d >= percentile(moves.map((x) => x.n.d), 0.9));
    const fx = front.reduce((s, m) => s + Math.sin((bearing(m.n.q, m.p) * Math.PI) / 180), 0);
    const fy = front.reduce((s, m) => s + Math.cos((bearing(m.n.q, m.p) * Math.PI) / 180), 0);
    const observedBearing = ((Math.atan2(fx, fy) * 180) / Math.PI + 360) % 360;
    // model origin: the earlier-pass edge the front ran from
    const origin = {
      lat: front.reduce((s, m) => s + m.n.q.lat, 0) / front.length,
      lng: front.reduce((s, m) => s + m.n.q.lng, 0) / front.length,
      t: A.t,
    };
    const hours = Math.round(dtH);
    const h = await archive(origin.lat, origin.lng);
    const shipped = weatherFor(h, A.t, hours, true);
    const hoursList = [shipped, ...shipped.nextHours!];
    const sample: Sample = {
      start: new Date(A.t).toISOString().slice(0, 16),
      hours,
      lat: +origin.lat.toFixed(3),
      lng: +origin.lng.toFixed(3),
      pixels: fire.length,
      observedKm: +observedKm.toFixed(2),
      observedBearing: Math.round(observedBearing),
      meanWindKmh: +(hoursList.reduce((s, x) => s + x.windKmh, 0) / hours).toFixed(1),
      maxFfdi: Math.max(...hoursList.map((x) => x.ffdi)),
    };
    for (const veg of VEGETATION_LEVELS) {
      const shippedPred = predicted(origin, shipped, veg, hours);
      sample[`shipped_v${veg}`] = +shippedPred.advanceKm.toFixed(2);
      sample[`shipped_v${veg}_bearing`] = Math.round(shippedPred.bearing);
      sample[`mcarthur_v${veg}`] = +predicted(origin, weatherFor(h, A.t, hours, false), veg, hours).advanceKm.toFixed(2);
    }
    sample.tenPercent = +(hoursList.reduce((s, x) => s + 0.1 * x.windKmh, 0)).toFixed(2); // rule alone, straight line
    samples.push(sample);
  }
}

// ---- report ----
function stats(name: string, pred: (s: Sample) => number) {
  const ratios = samples.map((s) => pred(s) / s.observedKm);
  const logs = ratios.map(Math.log);
  const geo = Math.exp(logs.reduce((a, b) => a + b, 0) / logs.length);
  const within2 = ratios.filter((r) => r >= 0.5 && r <= 2).length / ratios.length;
  const under = ratios.filter((r) => r < 1).length / ratios.length;
  const mape = ratios.reduce((s, r) => s + Math.abs(r - 1), 0) / ratios.length;
  return `| ${name} | ${percentile(ratios, 0.5).toFixed(2)} | ${geo.toFixed(2)} | ${(within2 * 100).toFixed(0)}% | ${(under * 100).toFixed(0)}% | ${(mape * 100).toFixed(0)}% |`;
}
const dirErr = samples.map((s) => angleBetween(s.observedBearing, s.shipped_v4_bearing as number));

console.log(`Detections ${pixels.length}, overpass windows ${windows.length}, fire runs measured ${samples.length}`);
console.log(`Observed advance: median ${percentile(samples.map((s) => s.observedKm), 0.5)} km over a median ${percentile(samples.map((s) => s.hours), 0.5)} h\n`);
console.log("| Model | Median predicted / observed | Geometric mean ratio | Within 2x | Underpredicted | MAPE |");
console.log("|---|---|---|---|---|---|");
console.log(stats("McArthur Mk5 only, dense fuel (25 t/ha)", (s) => s.mcarthur_v4 as number));
console.log(stats("McArthur Mk5 only, moderate fuel (12 t/ha)", (s) => s.mcarthur_v3 as number));
console.log(stats("10% wind rule alone", (s) => s.tenPercent as number));
console.log(stats("Shipped model, dense fuel", (s) => s.shipped_v4 as number));
console.log(stats("Shipped model, moderate fuel", (s) => s.shipped_v3 as number));
console.log(`\nDirection: median error ${percentile(dirErr, 0.5)}°, within 45° in ${((dirErr.filter((d) => d <= 45).length / dirErr.length) * 100).toFixed(0)}% of runs`);

// where the error comes from
const winds = samples.map((s) => s.meanWindKmh);
const floorChanged = samples.filter((s) => Math.abs((s.shipped_v4 as number) - (s.mcarthur_v4 as number)) > 0.01).length;
console.log(`Archived wind (mean over each run): median ${percentile(winds, 0.5)} km/h, 75th pct ${percentile(winds, 0.75)}, max ${Math.max(...winds)}`);
console.log(`10% rule floor changed the prediction in ${floorChanged} of ${samples.length} runs`);
const median = (sub: Sample[], pred: (s: Sample) => number) => percentile(sub.map((s) => pred(s) / s.observedKm), 0.5).toFixed(2);
for (const [label, sub] of [
  ["runs over 8 km", samples.filter((s) => s.observedKm >= 8)],
  ["runs with mean wind 20+ km/h", samples.filter((s) => s.meanWindKmh >= 20)],
] as const)
  console.log(
    `${label} (n=${sub.length}): median ratio McArthur dense ${median(sub, (s) => s.mcarthur_v4 as number)}, ` +
      `shipped dense ${median(sub, (s) => s.shipped_v4 as number)}, 10% rule ${median(sub, (s) => s.tenPercent as number)}`
  );

if (samplesOut) {
  const cols = Object.keys(samples[0] ?? {});
  writeFileSync(samplesOut, [cols.join(","), ...samples.map((s) => cols.map((c) => s[c]).join(","))].join("\n") + "\n");
  console.log(`\nPer-run samples: ${samplesOut}`);
}
