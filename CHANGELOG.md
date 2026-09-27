# Changelog

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