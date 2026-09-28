# Project Documentation

Three kinds of document live here:

- **[`live/`](live)**: the current truth. Edit these in place when something changes, and bump *Last updated*. If a live doc disagrees with the code, one of them is a bug.
- **[`decisions/`](decisions/decision-log.md)**: an append-only log of every decision and why it was made. Reversals get a new entry.
- **[`archive/`](archive)**: documents from past sprints, frozen as they were written. Each one links to the live doc that replaced it.

## Live documents

| Document | What it covers | Owner |
|---|---|---|
| [Requirements](live/requirements.md) | Users, functional/non-functional requirements with build status, lifecycle, review and override, edge cases, traceability, change log | Aryaveer (BA) |
| [Severity rubric](live/severity-rubric.md) | The four indicators, scoring formula, bands, confidence routing | Aryaveer / Liam |
| [Fire weather, spread and grouping](live/fire-weather-and-grouping.md) | Team overview: fire / not-a-fire rule, calibrated spread rings, BoM station weather and live refresh, incident merge and split | Liam |
| [Fire weather and spread backtest](live/spread-backtest.md) | Fire danger modifier, spread envelope formulas and sources, backtest against Black Summer satellite data | Liam |
| [Architecture](live/architecture.md) | Components, upload-to-score flow, API, configuration | Liam / Htet |
| [Metadata schema](live/metadata-schema.md) | `images` table, migrations, image storage | Liam |
| [AI models and dataset](live/ai-models-and-dataset.md) | Deployed models, labelling pipeline, training, accuracy targets | Liam |
| [Deployment and operations](live/deployment-and-operations.md) | Code Engine, CI/CD, secrets, known hazards, registry | Liam / Htet |
| [Development setup](live/dev-setup.md) | Local setup, IBM Cloud / watsonx access | Htet / Liam |
| [UI design](live/ui.md) | Current prototype and redlines, changes needed for the current rubric | Benjamin (UX) |
| [Live dispatch and crews](live/dispatch-crews.md) | Stations, crews and assignments, crew screen, comments, image gallery, polling, rate limit split | Liam |
| [Open questions](live/open-questions.md) | Undecided items, known gaps, assumptions | Everyone |

## Archive

| Folder | Contents |
|---|---|
| [`archive/mock-sprint/`](archive/mock-sprint) | Team page and login practice sprint |
| [`archive/sprint-1/requirements/`](archive/sprint-1/requirements) | Week 1 users and rubric, Week 2 user stories, Sprint 1 final requirements |
| [`archive/sprint-1/ai-ml/`](archive/sprint-1/ai-ml) | Framework selection, label proposal, dataset, preprocessing, data flow, integration contract, assumptions |
| [`archive/sprint-1/storage/`](archive/sprint-1/storage) | Storage and metadata v1, v2 and addendum |
| [`archive/sprint-1/setup/`](archive/sprint-1/setup) | IBM Cloud / watsonx setup, verification and account problems |
| [`archive/sprint-1/ui/`](archive/sprint-1/ui) | Weeks 1–3 prototypes, notes and UX research |
| [`archive/sprint-2/week-1/`](archive/sprint-2/week-1) | Sprint 2 implementation requirements, developer redline annotations |
