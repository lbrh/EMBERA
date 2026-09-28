# Fire Weather, Spread and Incident Grouping

**Status:** Live. Team overview of branch `feature/fire-weather-grouping`: the fire / not-a-fire rule, calibrated spread rings, live station weather, and coordinator merge and split.
**Owner:** Liam Robinson Hounsell (Dev 2)
**Last updated:** 2026-09-27
**Detail:** [Fire weather and spread backtest](spread-backtest.md) (formulas, method, full results) · [decision log](../decisions/decision-log.md) D-33 to D-35

---

## Summary

The branch makes the risk score and map weather-aware, and lets coordinators fix incident grouping. It adds two commits on top of `main`. Tests pass: 75 backend (including integration against the shared database) and 18 frontend, plus typecheck, lint and the production build.

| Change | What it does | Main code |
| --- | --- | --- |
| Fire / not-a-fire rule | Smoke or flame at level 2 to 4 means fire; both at 1 goes to manual review | `assess-severity.ts` |
| Calibrated spread rings | McArthur rate of spread × 2.5, fitted and tested on Black Summer satellite data | `spread.ts`, `spread-backtest.ts` |
| Station wind + live refresh | Nearest Bureau of Meteorology station for current wind; open incidents re-checked every 10 minutes | `bom-stations.ts`, `refresh-weather.ts` |
| Merge and split | Coordinators merge two incidents into one, or split an image into its own incident | `metadata.repository.ts`, `MergeIncidents.tsx` |

## Fire or not a fire

An image is a fire when smoke **or** flame is at level 2 to 4. When both are at level 1, it goes to manual review, however confident the models are. Before this, every image was scored as a fire, so a cloud or sunset photo got a marker.

| Smoke | Flame | Label | What happens |
| --- | --- | --- | --- |
| 2 to 4 | any | `fire` | Scored and shown as normal |
| any | 2 to 4 | `fire` | Scored and shown as normal |
| 1 | 1 | `uncertain` | Routed to manual review as "No smoke or flame detected" |

Nothing is dismissed automatically: a reviewer confirms it as a fire or discards it. This is a rule over the existing indicator models, not a trained fire-gate model; the D-25 accuracy target would apply to one if it replaces this rule.

## Spread rings and backtest

The rings now match real fire runs on average. Plain McArthur drew them about half the size fires actually ran, so the rate is multiplied by 2.5, which is inside CSIRO's published "2 to 3 times" underprediction.

How each ring is drawn:

- **Fire danger:** McArthur Mk5 Forest Fire Danger Index (FFDI) from temperature, humidity and wind, with worst-case drought.
- **Rate:** 2.5 × 0.0012 × FFDI × fuel load (km/h). Fuel load comes from the image's vegetation level (2, 5, 12 or 25 t/ha).
- **Floor:** on windy, dry days in forest, at least 10% of the wind speed (Cruz and Alexander's rule).
- **Shape:** each hour, every point on the edge grows an ellipse downwind using that hour's wind, so a forecast wind change bends the rings at 1, 2 and 3 hours.

The backtest runs the app's own code against 653 fire runs measured from NASA satellite passes over Victoria during Black Summer (December 2019 to January 2020), with archived hourly weather. Median predicted ÷ observed run, where 1.00 is exact and below 1 means the rings are too small:

| Model | Median predicted ÷ observed |
| --- | --- |
| McArthur Mk5, dense fuel | 0.54 |
| McArthur Mk5, moderate fuel | 0.26 |
| **Shipped (Mk5 × 2.5), dense fuel** | **1.33** |
| **Shipped, moderate fuel** | **0.64** |
| 10% wind rule alone | 3.66 |

The factor was fitted on December's 140 runs only, then checked on January's 513:

| January 2020 (not used to fit) | Median predicted ÷ observed | Within 2× | Predicted too small |
| --- | --- | --- | --- |
| Plain McArthur | 0.54 | 42% | 73% |
| Shipped model | 1.34 | 49% | 36% |

Two limits remain. Runs of 8 km or more are still about 4× short (0.22), and the head points within 45° of the real run only a third of the time. Full method and reproduce commands: [spread-backtest.md](spread-backtest.md).

## Live weather

Current wind now comes from a real Bureau of Meteorology station when one is close enough, and every open incident is re-checked every 10 minutes. The backtest showed gridded model wind runs low on bad fire days, so a measured value wins when there is one.

**Source.** One public file, `IDV60920.xml`, holds the latest reading from every Victorian automatic weather station and updates about every 10 minutes. It needs no key, but the Bureau refuses requests without an identifying User-Agent. 98 of its 105 stations report wind.

A station is used only if it passes all three checks; otherwise the app falls back to Open-Meteo's forecast model for current conditions:

| Check | Limit | Why |
| --- | --- | --- |
| Distance | Within 40 km | Further away, terrain makes it a poor stand-in |
| Height | Within 400 m of the fire's ground height | A summit station reads far windier than the valley (Mount William vs Halls Gap) |
| Age | Reported in the last 90 minutes | A silent station isn't current |

The next 2 hours always come from Open-Meteo; they are what bends the spread rings. In a dry run on 27 September, 13 of 15 open incidents had a qualifying station; Bright and Eildon fell back to the model.

**Refresh.** The backend refreshes open incidents every 10 minutes and once at startup, which covers a cold start after Code Engine scales to zero. A database try-lock means only one instance does the work. Each refresh:

1. Looks up weather for the incident's newest image, skipping any looked up in the last 20 minutes.
2. Re-applies the fire-danger modifier: FFDI 50 or more adds one level to the image's score, capped at 4.
3. Logs any change to the AI severity in the incident's activity as "AI severity (fire weather)", by "Weather refresh". A coordinator's override is never touched.

**In the app.** "How this severity was scored" says where the weather came from and when, for example "Measured at BoM Glenburn (CFA) station, 22 km away, updated 5 min ago". The map tooltip on the rings shows the same source.

## Merging and splitting incidents

Coordinators can now fix the auto-grouping in both directions: merge two reports of the same fire, or split off a photo grouped into the wrong fire. Auto-grouping itself is unchanged (within 2 km and 6 hours of an incident's latest image), except that it now skips extinguished and archived incidents, so a new fire next to a closed one isn't hidden inside it.

| | Merge | Split |
| --- | --- | --- |
| Where | "Same fire?" on the incident page: open incidents within 15 km, nearest first | "Not the same fire? Split it off" under the selected image in the gallery |
| What moves | Every image, crew assignment, comment, decision and support request of the other incident | The one image and its own review and override history |
| Result | One incident, live if either was; the other stops existing | A new incident with its own review and dispatch |
| Blocked when | Either incident is extinguished or archived (reopen it first) | It is the incident's only image |
| API | `POST /incidents/:id/merge` with `intoIncidentId` | `POST /images/:id/split` |

Merge asks for a second click to confirm, because it can't be fully undone: splitting an image back out doesn't return the other incident's crews or history. Both actions appear in the activity log of every incident involved, and the map and gallery update on the next poll.

## Operating notes

The one thing to watch: every backend that starts, including a teammate's local one, runs the weather refresh against the shared database. That replaces the demo seed's fixed wind-change weather with real weather, which can move demo severities (on a calm night Halls Gap drops from 4 to 3).

- **Before a demo:** set `WEATHER_REFRESH_MINUTES=0` on the backend, then run `npm run seed:demo -- --yes` to restore the fixed weather and scores.
- **Config:** `WEATHER_REFRESH_MINUTES` defaults to 10; 0 turns the refresh off. It is documented in `backend/.env.example`. No other new settings or secrets.
- **Schema:** nothing new on this branch; `images.weather` (JSONB) was added in the earlier commit on `main`.
- **Tests:** the new integration tests (`merge-split`, `weather-refresh`) insert throwaway rows in the shared database and delete them afterwards, like the existing ones.
- **Reproducing the backtest:** the commands are in [spread-backtest.md](spread-backtest.md). The NASA data is about 195 MB, so it isn't committed.

## Limitations and next steps

The rings are indicative, not a boundary to plan to: they still under-draw the biggest runs and have little skill on direction.

- **Station-wind backtest.** The backtest used gridded ERA5 wind because the Bureau's public feed only keeps 72 hours. Re-running with historical station data would show how much of the remaining error was the wind, and whether the 2.5 factor should be refitted.
- **Station coverage.** Victoria only; fires near the NSW or SA border fall back to the model. The Bureau could also change or block the feed, in which case the app falls back to the model everywhere.
- **No slope yet.** Spread roughly doubles for every 10° uphill, but the photo's location is the photographer's, not the fire's.
- **Fire gate.** The smoke/flame rule is a stand-in for a trained fire / not-a-fire model.
- **FFDI labels.** Bands are shown as "legacy" (pre-2022); the app doesn't compute today's official AFDRS ratings.

## Sources

- [Noble et al. 1980, McArthur's fire-danger meters expressed as equations](https://onlinelibrary.wiley.com/doi/abs/10.1111/j.1442-9993.1980.tb01243.x)
- [CSIRO Amicus fire model library](https://research.csiro.au/amicus/resources/model-library/) (Mk5 underprediction of 2 to 3 times)
- [Cruz and Alexander 2019, the 10% wind speed rule](https://link.springer.com/article/10.1007/s13595-019-0829-8)
- [Vesta Mk 2 user's guide (CSIRO)](https://research.csiro.au/vestamk2/) (fuel moisture table)
- [NASA FIRMS VIIRS fire detections](https://firms.modaps.eosdis.nasa.gov/country/)
- [Bureau of Meteorology weather data services](https://www.bom.gov.au/catalogue/data-feeds.shtml) (IDV60920; data © Commonwealth of Australia)
- [Australian Fire Danger Rating System](https://afdrs.com.au/)
