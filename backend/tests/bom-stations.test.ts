import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nearestFrom, parseStations } from '../src/pipeline/bom-stations.ts';

const station = (name: string, lat: number, lon: number, height: number, time: string, wind: string) => `
    <station wmo-id="1" bom-id="1" tz="Australia/Melbourne" stn-name="${name.toUpperCase()}" stn-height="${height}" type="AWS" lat="${lat}" lon="${lon}" description="${name}">
      <period index="0" time-utc="${time}" time-local="x" wind-src="metar_10">
        <level index="0" type="surface">
          <element units="Celsius" type="air_temperature">30.5</element>
          <element units="%" type="rel-humidity">15</element>
          ${wind}
        </level>
      </period>
    </station>`;
const wind = '<element units="deg" type="wind_dir_deg">315</element><element units="km/h" type="wind_spd_kmh">41</element>';
const xml = `<product><observations>
    ${station('Valley', -37.5, 145.4, 300, '2026-01-10T03:00:00+00:00', wind)}
    ${station('Summit', -37.52, 145.36, 1100, '2026-01-10T03:00:00+00:00', wind)}
    ${station('Calm Gauge', -37.52, 145.35, 300, '2026-01-10T03:00:00+00:00', '')}
    ${station('Stale', -37.52, 145.351, 300, '2026-01-09T20:00:00+00:00', wind)}
</observations></product>`;
const now = Date.parse('2026-01-10T03:20:00Z');

test('parses station observations and skips stations with no wind reading', () => {
    const stations = parseStations(xml);
    assert.deepEqual(stations.map((s) => s.name), ['Valley', 'Summit', 'Stale']);
    assert.deepEqual(
        { ...stations[0] },
        { name: 'Valley', latitude: -37.5, longitude: 145.4, heightM: 300, observedAt: '2026-01-10T03:00:00.000Z', windKmh: 41, windFromDeg: 315, temperatureC: 30.5, humidityPct: 15 },
    );
});

test('picks the nearest recent station at a similar height, else none', () => {
    const stations = parseStations(xml);
    // Summit and Stale are closer to Kinglake than Valley, but one is 800 m higher and one is 7 h old
    assert.equal(nearestFrom(stations, -37.52, 145.35, 250, now)?.station.name, 'Valley');
    // without a known ground height, the summit counts
    assert.equal(nearestFrom(stations, -37.52, 145.35, null, now)?.station.name, 'Summit');
    // 40 km cut-off
    assert.equal(nearestFrom(stations, -38.2, 145.4, 250, now), null);
});
