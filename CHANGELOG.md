# Changelog

## Unreleased

Splits EMBERA into three views, one for each kind of user, adds a public overview page, and lets crews review and undo their own actions.

### Frontend

- **Three views, each with its own address and header:**
  - **Civilian** (`/civilian`): the Report a fire form for the public. Uploads are always filed as citizen reports, and the page confirms with a reference number instead of opening the coordinator's incident page.
  - **Coordinator** (`/coordinator/...`): the map, dispatch order, manual review, resolved, archive, crews and incident pages. The Submit tab is gone.
  - **Crew** (`/crew`): a crew's assignment and on-scene actions, without the coordinator's tabs or shortcuts.
- **Overview page** (`/`): what EMBERA is and how it works, then one person per view in the order a report travels (a resident, the coordinator, a crew leader), each with a short description, their steps and a product screenshot (light and dark). Styled after IBM's product pages.
- **Crew log:** on the crew view, a log of everything the crew did there: status changes, fire out, false alarm, severity changes, support requests and photos. The newest change on a fire can be undone, and a severity change can be changed again.
- **Map:** a Terrain layer (OpenTopoMap, with contours and hill shading) alongside Map and Satellite.
- **Branding:** the striped flame logo replaces the gradient "E", in the header and as the browser-tab icon.
- **Theme:** follows the browser's light / dark setting, including changes while the page is open. The Light / Dark switch is gone.
- **Navigation:**
  - The EMBERA logo always goes to the overview.
  - Old addresses (`/dispatch`, `/review`, `/submit` and so on) redirect to their new ones.
  - Unknown addresses show a branded "page not found" with a way back.
  - Each page has its own browser-tab title.
- **Removed:** the Demo outcomes buttons on the report form.

### Backend

- A crew can step its status back one step (on scene → en route → dispatched) to undo a mistake. Skipping a step is still refused.

### Tooling

- `pnpm screenshots` regenerates the overview's product screenshots from a running dev server with mock data.


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