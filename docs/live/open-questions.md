# Open Questions, Assumptions and Known Gaps

**Status:** Live. Add to it when something is unknown; move items into the [decision log](../decisions/decision-log.md) when they're decided.
**Last updated:** 2026-09-25
**Supersedes:** [Technical assumptions and limitations](../archive/sprint-1/ai-ml/Technical_Assumptions_and_Limitations.md)

---

## 1. Needs a decision

| # | Question | Owner | Notes |
|---|---|---|---|
| Q1 | Sign off the 2026-09-24 rubric (people proximity dropped, vegetation and infrastructure as amounts, vegetation gated on fire) | Aryaveer, client | D-17 to D-19 |
| Q2 | Adopt the fire-gate target (≥ 98% fire recall, asymmetric 0.95 non-fire threshold)? | Aryaveer, client | D-25 |
| Q4 | Give CI its own database again? | Dev | Tried with a staging database (D-30), dropped (D-32). Until then schema changes stay additive |
| Q6 | Satellite images: same visual rubric or a separate scoring path? | Aryaveer | Schema is source-agnostic either way |
| Q7 | Real operating region and geotag accuracy tolerance | Client | Victoria bounding box is a placeholder |
| Q8 | Delete the prod test records and unused registry images | Liam | See deployment doc §5–6 |

## 2. Known gaps in what's built

- **No fire gate model.** Every image is treated as a fire.
- **Vegetation and infrastructure models** predate the rubric and must be retrained. Until infrastructure has a 4-output model, no image gets an automatic score.
- **Not built:** `priority_rank` computation, override endpoint and history, archive/resolved flows.
- **Frontend** is a scaffold.
- **Old backend images** can't be rolled back to (they write a dropped column).

## 3. Assumptions

- A single still image is enough to judge each indicator. Unvalidated.
- The minimum of four indicator confidences is a sensible overall confidence. A design choice, not validated.
- AI-generated labels (qwen2.5vl) are good enough to train on after a human spot-check. They are **not** good enough to measure accuracy against; a human-checked test set is needed.
- D-Fire and FlameVision skew towards obvious fire scenes. There will be few examples of the rubric's middle levels, and few of heavily built-up fires.
- Latency and accuracy targets are team-proposed, not client-confirmed.
- No real users or live feeds; everything is simulated.
- The project needs continuous IBM Cloud access; there is no offline mode.
