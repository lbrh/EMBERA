# Changelog

## v1.0.0

This release splits EMBERA into three views: civilians report fires, coordinators run the response, and crews work from their phones. It also adds a public landing page with a new logo, and makes AI confidence and "AI assessing…" more reliable.

### Backend

- **Confidence score:** now the mean of the smoke and flame confidences, rounded so float noise can't push a score over the 0.75 line. Before, it was the lowest of the four, so one weak vegetation or infrastructure reading could send a clear fire to review. The review note now reads "smoke/flame confidence 0.7" (D-36).
- **"AI assessing" is only used while the AI is working:**
  - If a model fails or isn't set up, the image now goes to `unable_to_assess` (manual review) instead of staying in `pending_review`.
  - A sweep runs at startup and then every 5 min. It sends any image still pending 10 min after upload to manual review ("AI assessment did not finish"). This catches assessments stopped by a deploy or scale-down.
  - New column `images.created_at`, which records when each row was written. The sweep uses it.
- **Crew status undo:** `PATCH /assignments/:id` now accepts one step back (on scene → en route → dispatched), so a crew can undo a status they set by mistake. Skipping a step still returns 409.
- **Scripts:**
  - `npm run time-ingest` times a photo from upload until it's scored, on the staging database. It won't run against prod and cleans up after itself.
  - The demo seed now sets smoke and flame to the same confidence, so each seeded image's score matches its value.
  - The demo seed now also resets comments, crew assignments and support requests. Before, a reseed left crews stuck on incidents that no longer existed. It seeds crews en route and on scene, an open request for aerial support, a crew photo, comments, and the nearest BoM station in each image's weather.

### Frontend

- **Three views:**
  - **Civilian** (`/civilian`): "Report a fire", a simple upload form with no incident data. Photos are always sent as citizen reports. The form clears after each report, so the same photo can be picked again.
  - **Coordinator** (`/coordinator/...`): the map, dispatch order, manual review, resolved, archive and crews pages. "Submit image" is no longer a coordinator tab.
  - **Crew** (`/crew`): a separate phone view with its own header and no coordinator tabs or shortcuts.
  - Old addresses (`/dispatch`, `/incident/:id`, `/submit`, `/report` and so on) redirect to the new ones (307).
- **Crew view:**
  - A new "Your log" lists what the crew did from this screen. The latest change on each fire can be undone (status, extinguished or false alarm, support request), or its severity can be changed again. Photos can't be undone. The log only lasts for the session, and the incident's Activity feed keeps the full history.
  - The "Standing by" screen updates by itself when the crew is dispatched.
- **Landing page (`/`):** covers how EMBERA works, the three views with product screenshots, key figures, capabilities, the IBM Cloud stack, About us and the team.
- **Branding:** a new tonal stripe-flame logo and favicon, and colours from the IBM Gray palette with flat IBM Blue buttons. The theme now follows the browser's light or dark setting, and the manual Light / Dark switch is gone.
- **Map:** new Terrain layer (OpenTopoMap contours and hillshade).
- **"AI assessing…"** now shows while the AI is still working, instead of "Flagged for manual review".
- **Other:**
  - A 404 page.
  - Page titles for each tab ("Dispatch order · Coordinator · EMBERA").
  - `pnpm screenshots` re-captures the landing page's product shots from the mock dev server.

### Infrastructure

- The frontend Docker build skips `scripts/`. The deploy was failing because the build couldn't type-check the spread backtest.

### Documentation

- `docs/brand/logo-options/`: the logo candidates, with a preview page.
- Updated the architecture, dispatch crews, metadata schema, requirements, severity rubric and UI docs.
- NFR1 latency now has a measured figure for the AI stage: median 1.9 s and p90 2.4 s warm, 6.0 s cold.
- New decision log entry D-36.

### Known gaps

- There are still no real logins. The coordinator name is hardcoded, and the crew view makes you pick which crew you are. Ideal for demos, but not truly production ready.

## v0.2.0

This release adds live dispatch of response crews, fire weather and spread forecasts, merging and splitting incidents, and a real fire / not-a-fire check.

### Backend

- **Fire / not-a-fire:** the four indicator models now decide it. An image is a fire if smoke or flame scores 2–4. If both score 1, it's marked uncertain and always goes to manual review ("No smoke or flame detected"). Images are no longer all treated as fires.
- **Fire weather:** current conditions come from the nearest Bureau of Meteorology (BoM) station (within 40 km and 400 m of height, and no more than 90 min old). Forecast hours come from Open-Meteo. Weather now feeds into the severity score.
- **Live weather refresh:** open incidents re-read their weather every `WEATHER_REFRESH_MINUTES`, which defaults to 10 (some BoM stations update more often than every 30 min). The refresh also runs at startup, on one instance at a time. Any change it makes to an AI severity is logged.
- **Merge and split incidents:**
  - `POST /incidents/:id/merge` joins two incidents that are the same fire.
  - `POST /images/:id/split` moves an image off into its own incident.
- **Comments:** `GET` and `POST /incidents/:id/comments` read and add to an append-only `comments` table.
- **Response crews:** new `stations`, `crews`, `assignments` and `support_requests` tables.
  - `GET /crews` lists every crew and what it's assigned to.
  - `POST /incidents/:id/assignments` dispatches crews to an incident, and `PATCH /assignments/:id` moves an assignment through dispatched → en route → on scene, or recalls the crew.
  - `POST /incidents/:id/support-requests` lets a crew on scene ask for more help. `GET /support-requests` lists the open requests and `PATCH /support-requests/:id` resolves or dismisses one.
  - `crew` is a new image source, for photos a crew takes on scene.
- **Rate limits:** split into reads (600 per minute) and writes (60 per minute) for each caller, replacing the flat 30 per minute. The UI now polls and loads thumbnails, which needs the larger read budget.

### Frontend

- **Crews:**
  - A crew picker dispatches crews from the incident and dispatch pages, and each incident shows the crews assigned to it.
  - The new Crews page lists every crew by station, shows which fire each is on and at what step, and can recall a crew.
  - The crew view shows a crew their assignment. From there they can update their status, mark the fire extinguished or a false alarm, change its severity, request support, add photos, and see the activity feed.
  - Support requests appear as alerts on the dispatch page and as a banner on the incident page.
- **Map:**
  - Spread rings show how far a fire could travel. They use the McArthur Mk5 model scaled by 2.5 and follow forecast wind changes.
  - New: a map scale, a satellite layer, and "Locate on map", which also shows an image under review as a dashed "Under review" pin.
- **Incident page:**
  - An image gallery, with "Split it off" for images that belong to another fire.
  - A "Same fire?" suggestion for merging with a nearby incident.
  - An activity feed that combines comments and coordinator decisions, with a comment box.
  - Fire weather in the "How it was scored" explainer.
- **Live updates:** the dashboard re-reads incidents every 5 s while its tab is visible. A refresh skips any incident with an action still in progress, so it can't undo a click.
- **Lists:** search and filtering on Dispatch order, Manual review, Resolved and Archive. Rows now pulse briefly when an incident moves between lists, and a notification links to where it went.
- **Fixes:**
  - Undoing "false alarm" or "extinguished" now sends the crews back as well.
  - The crew picker no longer keeps crews picked the last time it was opened.
  - Removed "Request second image", which didn't do anything.

### Infrastructure

- CI and deploy tests now run against a staging database, so a pull request never touches prod.
- `schema.sql` is applied to prod only in the backend deploy job, after the image is built.

### Documentation

- New docs:
  - `docs/live/dispatch-crews.md`: the crew and dispatch design.
  - `docs/live/fire-weather-and-grouping.md`: fire weather, spread and grouping.
  - `docs/live/spread-backtest.md`: a spread-model backtest on the 2019–20 Black Summer fires. Tuned on December 2019 fires and tested on January 2020, it moved the median predicted/observed spread from 0.54 to 1.34.
- Updated the architecture, rubric, requirements, schema, UI, and deployment and operations docs.
- New decision log entries, D-29 to D-35.

### Known gaps

- There are still no real logins. The coordinator name is hardcoded, and the crew view makes you pick which crew you are.

## v0.1.0

First release of **EMBERA** (Emergency Monitoring for Bushfire Evaluation, Response and Awareness). EMBERA takes in bushfire images, rates how severe each one is using AI, and shows the incidents to coordinators on a map, sorted by priority.

### Backend

Express + TypeScript, deployed on IBM Code Engine.

- **Ingestion:** one upload endpoint, `POST /ingest`, for images from the web form, drones, CCTV and satellites. Each image goes to Cloud Object Storage and its details go to Postgres.
- **AI severity assessment:** runs in the background after upload. Four indicator models on watsonx.ai (smoke, flame, vegetation, infrastructure) feed a rubric that produces a severity from 1 to 4, a confidence and a written explanation.
- **Manual review:** results with confidence ≤ 0.75 go to manual review and are never shown as confirmed.
- **Incident grouping:** images within 2 km and 6 h of each other are grouped into one incident automatically.
- **Query endpoints:**
  - `GET /incidents` returns incidents in a map viewport.
  - `GET /incidents/:id` returns every image in an incident.
  - `GET /order` returns incidents in dispatch priority order.
  - `GET /images/:id` returns a signed image link, and `GET /images/:id/preview` returns a preview.
- **Coordinator endpoints:**
  - `PATCH /images/:id/decision` overrides the AI's severity or label. The AI's original values are kept.
  - `PUT /incidents/:id/dispatch` moves an incident through awaiting → live → extinguished → archived.
  - `GET /incidents/:id/decisions` returns the audit log of coordinator changes.
- **Security:** every call needs an API key, and each caller is rate-limited to 30 requests per minute.

### Frontend

Next.js.

- Pages: Map (Leaflet, with hover cards on incident markers), Incident detail, Dispatch order, Manual review, Image submission, Resolved and Archive.
- Light and dark themes, loading placeholders and button feedback.
- A layout that works on phones and tablets.
- Form validation, with tests.

### Infrastructure

- GitHub Actions CI/CD that deploys to IBM Code Engine.
- Dependabot for automatic dependency updates.
- pnpm and Node 25 Docker images.

### Documentation

- `docs/live/` holds the current docs: requirements, severity rubric, architecture, metadata schema, AI models and dataset, deployment and operations, dev setup, UI, and open questions.
- `docs/decisions/decision-log.md` is an append-only log of every decision and why it was made.
- `docs/archive/` holds past sprint documents, kept as they were written.

### Known gaps

- There's no fire / non-fire model yet, so every image is treated as a fire.
- Not built yet: coordinators confirming or splitting incident groups, the ranking reason, and keeping markers from overlapping on the map.
- There are no real logins. The coordinator name is hardcoded and everyone shares one API key.
- Dispatch crews (`docs/live/dispatch-crews.md`) is only a spec so far and isn't part of this release.