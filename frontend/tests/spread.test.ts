import { describe, expect, it } from "vitest";
import { fineFuelMoisturePct, spreadPerimeters, spreadRateKmh } from "../src/lib/utils/spread";
import { distanceKm } from "../src/lib/utils/geo";
import type { FireWeather } from "../src/lib/types";

const origin = { lat: -37.5, lng: 145.3 };
// humid enough (fuel moisture ~9.6%) that the 10% wind rule stays off: pure McArthur
const hour = (windFromDeg: number) => ({ temperatureC: 30, humidityPct: 60, windKmh: 35, windFromDeg, ffdi: 40 });
const weather = (...winds: number[]): FireWeather => ({
  observedAt: "",
  ...hour(winds[0]),
  nextHours: winds.slice(1).map((w) => ({ time: "", ...hour(w) })),
});

/** The point of a ring farthest from the ignition point: the head of the fire. */
function head(ring: [number, number][]) {
  const km = ring.map(([lat, lng]) => ({ lat, lng, d: distanceKm(origin, { lat, lng }) }));
  return km.reduce((far, p) => (p.d > far.d ? p : far));
}

describe("spreadRateKmh", () => {
  const dry = { temperatureC: 30, humidityPct: 20, windKmh: 35, ffdi: 40 };

  it("matches the Vesta Mk 2 guide's Table M1 fuel moisture", () => {
    expect(fineFuelMoisturePct(10, 5)).toBeCloseTo(3.2, 1);
    expect(fineFuelMoisturePct(40, 10)).toBeCloseTo(3.3, 1);
  });

  it("floors McArthur at 10% of the wind on dry, windy days in forest", () => {
    expect(spreadRateKmh(dry, 3)).toBeCloseTo(3.5, 5); // McArthur alone: 0.0012 x 40 x 12 = 0.576
  });

  it("leaves McArthur alone below 30 km/h, in moist fuel, or in sparse (possibly grass) fuel", () => {
    expect(spreadRateKmh({ ...dry, windKmh: 30 }, 3)).toBeCloseTo(0.576, 5);
    expect(spreadRateKmh({ ...dry, humidityPct: 60 }, 3)).toBeCloseTo(0.576, 5);
    expect(spreadRateKmh(dry, 2)).toBeCloseTo(0.24, 5);
  });
});

describe("spreadPerimeters", () => {
  it("runs downwind at the McArthur rate: a steady north-westerly pushes the head south-east", () => {
    const rings = spreadPerimeters(origin, weather(315, 315, 315), 3)!;
    expect(rings).toHaveLength(3);
    const h2 = head(rings[1]);
    expect(h2.lat).toBeLessThan(origin.lat);
    expect(h2.lng).toBeGreaterThan(origin.lng);
    // R = 0.0012 x 40 x 12 t/ha = 0.576 km/h, so 2 h puts the head ~1.15 km out
    expect(h2.d).toBeCloseTo(1.152, 2);
    expect(head(rings[2]).d).toBeCloseTo(head(rings[0]).d * 3, 3);
  });

  it("holds the current wind when there is no forecast", () => {
    const steady = spreadPerimeters(origin, weather(315, 315, 315), 3)!;
    const noForecast = spreadPerimeters(origin, { ...weather(315), nextHours: undefined }, 3)!;
    expect(head(noForecast[2]).d).toBeCloseTo(head(steady[2]).d, 6);
  });

  it("bends with a south-westerly change: the front swings north-east", () => {
    const steady = spreadPerimeters(origin, weather(315, 315, 315), 3)![2];
    const change = spreadPerimeters(origin, weather(315, 270, 225), 3)![2];
    const northmost = (ring: [number, number][]) => Math.max(...ring.map(([lat]) => lat));
    // the last hour runs NE at 0.576 km/h, so the front ends ~0.4 km further north than under a steady NW
    expect(northmost(change)).toBeGreaterThan(northmost(steady) + 0.003); // > ~0.33 km
  });

  it("is null with no fuel reading", () => {
    expect(spreadPerimeters(origin, weather(0), null)).toBeNull();
    expect(spreadPerimeters(origin, weather(0), 0)).toBeNull();
  });
});
