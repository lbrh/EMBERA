import { describe, expect, it } from "vitest";
import { spreadEllipse } from "../src/lib/utils/spread";
import { distanceKm } from "../src/lib/utils/geo";

const origin = { lat: -37.5, lng: 145.3 };
const weather = (windFromDeg: number) => ({ observedAt: "", temperatureC: 30, humidityPct: 20, windKmh: 35, windFromDeg, ffdi: 40 });

describe("spreadEllipse", () => {
  it("runs downwind: a north-westerly pushes the head south-east of the ignition point", () => {
    const outline = spreadEllipse(origin, weather(315), 3, 2)!;
    const head = outline[0]; // t = 0 is the head of the fire
    expect(head[0]).toBeLessThan(origin.lat);
    expect(head[1]).toBeGreaterThan(origin.lng);
    // R = 0.0012 x 40 x 12 t/ha = 0.576 km/h, so 2 h puts the head ~1.15 km out
    expect(distanceKm(origin, { lat: head[0], lng: head[1] })).toBeCloseTo(1.152, 2);
  });

  it("grows with time and is null with no fuel reading", () => {
    const reach = (hours: number) => {
      const [lat, lng] = spreadEllipse(origin, weather(0), 3, hours)![0];
      return distanceKm(origin, { lat, lng });
    };
    expect(reach(3)).toBeCloseTo(reach(1) * 3, 5);
    expect(spreadEllipse(origin, weather(0), null, 1)).toBeNull();
    expect(spreadEllipse(origin, weather(0), 0, 1)).toBeNull();
  });
});
