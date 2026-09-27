# Fire Weather and Spread Envelope: Method and Backtest

**Status:** Live. Describes what the fire-weather modifier and the map's spread envelope compute, where each formula comes from, and how the envelope scored against real fires.
**Owner:** Liam Robinson Hounsell (Dev 2)
**Last updated:** 2026-09-27
**Code:** `backend/src/pipeline/fire-weather.ts`, `backend/src/pipeline/bom-stations.ts`, `backend/src/pipeline/refresh-weather.ts`, `backend/src/pipeline/assess-severity.ts` (`applyFireDanger`), `frontend/src/lib/utils/spread.ts`, `frontend/scripts/spread-backtest.ts`

> **Bottom line:** plain McArthur Mk5 runs about 2× short on real fires, so the app multiplies it by **2.5**, fitted on December 2019 and checked on held-out January 2020 runs. There the median predicted/observed went from **0.54 to 1.34** and runs predicted too short fell from 73 % to 36 %. The big runs (8 km or more) are still about 4× short, so the rings are indicative, not a boundary to plan to.

---

## 1. What the app computes

| Step | Formula | Source |
|---|---|---|
| Weather | "Now" is the nearest Bureau of Meteorology automatic weather station within 40 km and 400 m of height, observed in the last 90 min; otherwise Open-Meteo's model. The next 2 hours always come from Open-Meteo. Looked up at ingest and refreshed every 30 min while the incident is open. | BoM IDV60920, open-meteo.com |
| Fire danger | McArthur Mk5 Forest Fire Danger Index: `FFDI = 2·exp(−0.45 + 0.987·ln DF − 0.0345·RH + 0.0338·T + 0.0234·V)`. Drought factor fixed at 10 (worst case). | Noble et al. 1980 |
| Severity modifier | FFDI ≥ 50 adds one level to the image's severity, capped at 4 | App rule (FFDI 50 = "Severe" on the legacy scale) |
| Rate of spread | McArthur Mk5 forest: `R = 2.5 × 0.0012 × FFDI × fuel load` (km/h). Fuel load is guessed from the image's vegetation level: 2, 5, 12 or 25 t/ha. The 2.5 corrects Mk5's known underprediction (§3). | Noble et al. 1980; this backtest |
| Rate floor | With open wind > 30 km/h, fine fuel moisture < 7 % and moderate or dense vegetation: `R = max(R, 0.1 × wind)` | Cruz & Alexander 2019 (10 % wind speed rule) |
| Fuel moisture | `MC = 2.76 + 0.124·RH − 0.0187·T` (peak burning period). Checked against Vesta Mk 2 guide Table M1. | Gould et al. 2007 |
| Shape | Ellipse per hour, burning point at the rear focus, length-to-breadth `1 + 8.729·(1 − e^(−0.030·V))^2.155` | Alexander 1985; rear-focus convention per FARSITE docs |
| Growth | Each hour every point on the edge grows that hour's ellipse; the new edge is the convex hull of the result (Huygens' principle), so forecast wind changes bend the shape | As in Phoenix / FARSITE |

**Ratings.** The FFDI bands (Low-moderate, High, Very high, Severe, Extreme, Catastrophic) are the **pre-September 2022** McArthur scale. Australia now uses the AFDRS, whose ratings come from a Fire Behaviour Index this app does not compute. The UI always labels the band "legacy" so it isn't mistaken for today's official rating.

## 2. Backtest method

`frontend/scripts/spread-backtest.ts` runs the app's own `spreadPerimeters` against real fires:

- **Fires:** NASA FIRMS VIIRS (Suomi NPP, 375 m) fire detections, Victoria south of 35.9° S, 1 Dec 2019 to 31 Jan 2020 (Black Summer). Vegetation-fire pixels only (`type` 0), low-confidence pixels dropped: 135,824 detections in 114 overpass windows.
- **Observed runs:** for each pair of consecutive overpasses 6 to 16 h apart, the later pass's pixels are grouped into fires. Each pixel's distance to the nearest earlier-pass pixel is how far the edge moved there, and the 95th percentile over the fire is its observed advance. Runs under 1.5 km (near pixel size) and fires mostly unseen at the earlier pass are dropped: **653 runs**, median advance 2.95 km over a median 11 h.
- **Predicted runs:** the model grows a fire from the earlier edge hour by hour with archived hourly weather (ERA5 via Open-Meteo's archive API, 0.25° grid). The prediction is the farthest point of the grown shape. Run at dense (25 t/ha) and moderate (12 t/ha) fuel, since the backtest has no image to read vegetation from.

Reproduce (the FIRMS file is ~195 MB, so it isn't committed):

```bash
curl -s https://firms.modaps.eosdis.nasa.gov/data/country/viirs-snpp/2019/viirs-snpp_2019_Australia.csv > firms.csv
curl -s https://firms.modaps.eosdis.nasa.gov/data/country/viirs-snpp/2020/viirs-snpp_2020_Australia.csv | tail -n +2 >> firms.csv
awk -F, 'NR==1 || ($1>=-39.2 && $1<=-35.9 && $2>=140.96 && $2<=150.03 && $6>="2019-12-01" && $6<="2020-01-31" && $15=="0" && $10!="l")' firms.csv > vic.csv
node --no-warnings frontend/scripts/spread-backtest.ts vic.csv samples.csv
```

## 3. Results

Ratio = predicted ÷ observed advance. 1.00 is perfect; below 1 is underprediction.

| Model | Median ratio | Geometric mean | Within 2× | Underpredicted | MAPE |
|---|---|---|---|---|---|
| McArthur Mk5 uncorrected, dense fuel (25 t/ha) | 0.54 | 0.48 | 42 % | 73 % | 68 % |
| McArthur Mk5 uncorrected, moderate fuel (12 t/ha) | 0.26 | 0.23 | 25 % | 91 % | 68 % |
| 10 % wind rule alone (applied at every hour) | 3.66 | 2.95 | 22 % | 14 % | 311 % |
| **Shipped model (Mk5 × 2.5 + 10 % floor), dense fuel** | **1.33** | **1.21** | **47 %** | **37 %** | 141 % |
| Shipped model, moderate fuel | 0.64 | 0.58 | 48 % | 68 % | 73 % |

**Calibration, held out.** The correction is the geometric-mean bias of uncorrected Mk5 at dense fuel on the 140 December runs only: 2.45, rounded to 2.5 (inside CSIRO's published "2 to 3" underprediction). On the 513 January runs it was never fitted to:

| January 2020 (held out) | Median ratio | Geometric mean | Within 2× | Underpredicted |
|---|---|---|---|---|
| Uncorrected Mk5 | 0.54 | 0.50 | 42 % | 73 % |
| Shipped model | 1.34 | 1.26 | 49 % | 36 % |

| Subset | Mk5 uncorrected, dense | Shipped, dense | 10 % rule |
|---|---|---|---|
| Runs of 8 km or more (n = 123) | 0.09 | 0.22 | 0.70 |
| Mean archived wind 20 km/h or more (n = 22) | 0.43 | 1.07 | 8.67 |

**Direction:** the envelope's head points within 45° of the observed run direction in 33 % of runs (median error 75°; random would be 90°).

## 4. What the results mean

1. **Mk5 underpredicts about 2× overall**, matching the literature (CSIRO: "consistently underpredict[s] ... by a factor of 2 to 3"). The 2.5 correction removes most of that bias on data it wasn't fitted to, at the cost of a wider spread (MAPE 68 % → 141 %): the rings are now about right on average and too big about as often as too small.
2. **The biggest runs are still about 4× short.** Runs of 8 km or more are where coordinators most need warning; the correction helps (0.09 → 0.22) but doesn't close the gap.
3. **Weather input is a large part of the problem.** ERA5's 0.25° winds averaged only 9.5 km/h over these runs (maximum 30.6 km/h), far below station winds on Black Summer's worst days, so the 10 % floor changed only 2 of 653 predictions. Gale & Cary (2025) found the same. This is why the live app now takes "now" from the nearest BoM station (D-34): on the evening it was built, 13 of 15 open demo incidents had a station within 40 km. The backtest itself still uses ERA5, because BoM's public feed only keeps the last 72 hours.
4. **The 10 % rule alone is no better.** Applied every hour it overpredicts about 3.7×; it is only meant for strong-wind, dry-fuel hours.
5. **Direction has little skill** at this resolution. The shape shows "downwind-ish", not a heading to plan around.

## 5. Limitations of the backtest

- **Observed advance is approximate.** Pixels missed at the earlier pass (cloud, smoke, swath edge) and ember spot fires both read as advance, so some observed runs are too long. The 95th percentile, the 50 % seen-before filter and the 1.5 km minimum reduce this but don't remove it.
- **Fuel is assumed, not measured.** Every run uses 25 or 12 t/ha regardless of the real vegetation.
- **Not like-for-like with the live app.** It uses 11 h day-and-night windows where the app draws 3 h, and reanalysis weather where the app uses forecasts.
- **One region, one season.** Black Summer was extreme; typical seasons may score differently.

## 6. Next steps

1. **Station-wind backtest.** Re-run with station observations (BoM's historical data service) or BARRA2 to see how much of the remaining error was ERA5's wind. If station wind closes the gap, the 2.5 correction should be refitted, since it partly compensates for low gridded wind.
2. **Vesta Mk 2**, CSIRO's current eucalypt forest model, once fuel hazard scores are available.
3. **Slope**: roughly doubles spread for every 10° uphill; needs terrain at the fire, not the photographer.

## Sources

- Noble, Bary & Gill (1980). [McArthur's fire-danger meters expressed as equations](https://onlinelibrary.wiley.com/doi/abs/10.1111/j.1442-9993.1980.tb01243.x)
- Cruz & Alexander (2019). [The 10% wind speed rule of thumb for estimating a wildfire's forward rate of spread](https://link.springer.com/article/10.1007/s13595-019-0829-8)
- Cruz et al. (2021). [The Vesta Mk 2 rate of fire spread model: a user's guide](https://research.csiro.au/vestamk2/) (Table M1 fuel moisture)
- Alexander (1985). [Estimating the length-to-breadth ratio of elliptical forest fire patterns](https://www.frames.gov/catalog/10926)
- [FARSITE elliptical dimensions documentation](https://owfflammaphelp62.firenet.gov/LegacyFARSITE/Tech_Elliptical_Dimensions.htm)
- CSIRO. [Amicus fire model library](https://research.csiro.au/amicus/resources/model-library/) (Mk5 underprediction)
- Gale & Cary (2025). [Evaluating Australian forest fire rate of spread models using VIIRS satellite observations](https://www.sciencedirect.com/science/article/pii/S1364815225001203)
- [Australian Fire Danger Rating System](https://afdrs.com.au/)
- NASA FIRMS. [VIIRS active fire country data](https://firms.modaps.eosdis.nasa.gov/country/)
- Open-Meteo. [Historical weather API (ERA5)](https://open-meteo.com/en/docs/historical-weather-api)
- Bureau of Meteorology. [Weather data services](https://www.bom.gov.au/catalogue/data-feeds.shtml) (IDV60920 Victorian observations; data © Commonwealth of Australia)
