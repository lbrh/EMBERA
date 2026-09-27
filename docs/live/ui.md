# UI Design

**Status:** Live. Points at the current design and lists what has to change because of the 2026-09-24 rubric change.
**Owner:** Benjamin (UX)
**Last updated:** 2026-09-25

---

## 1. Current design

- **Latest prototype:** Bushfire Prototype Sprint 1 WK3, the [clickable prototype](https://claude.ai/code/artifact/12ca277f-285a-4a2c-8376-8a6c04f3aad7)
- **Build spec:** [Sprint 2 W1 developer redline annotations](../archive/sprint-2/week-1/SP2_WK1_Dev_Redline_Annotations.pdf): every element numbered with its visual spec, plus a present / partial / missing audit.
- **What changed and why:** [WK3 change log](../archive/sprint-1/ui/week-3/SP1_WK3_iteration_sum_doc.md), [WK2 notes](../archive/sprint-1/ui/week-2/SP1_WK2_notes.md)
- **Research:** [UX research](../archive/sprint-1/ui/week-2/UX_research.pdf), [WK1 user flow](../archive/sprint-1/ui/week-1/Task%201/week1-ui-tasks.md)

Screens: Map (clustered severity markers, side list, grouping suggestions), Incident Detail (score breakdown, decision log, override), Dispatch Order (awaiting / live), Manual Review, Archive, Resolved, Image Submission.

## 2. Changes needed for the current rubric

The prototype scores Smoke / Flame / **Damage-impact** / **People proximity** with a 4–16 total. The live [rubric](severity-rubric.md) is different:

| Prototype | Now |
|---|---|
| Damage / impact | **Vegetation**: amount of vegetation, counts 0 when there is no smoke or flame |
| People proximity | **Infrastructure**: amount of infrastructure nearby |
| Total 4–16, bands 4–7 / 8–10 / 11–13 / 14–16 | Total **3–16**, first band **3–7** |
| Exportable record `damage= people=` | `veg= infra=` |

The "How this severity was scored" block should show vegetation as "4 → 0 (no fire)" when it is gated, so the total adds up on screen.

## 3. Build notes from the backend

- **Scores arrive after the upload.** `/ingest` returns `pending_review` straight away. The submission screen's "processing" state should hand over to the map, which picks up the score by re-fetching `/incidents` for the viewport. Nothing waits on the upload call.
- **Rate limit:** 600 reads and 60 writes per minute, per browser (caller + client IP). Polling every 5 s uses 12 reads/min per open tab, so reads have plenty of headroom (D-29).
- **Threshold wording:** requirements say a score **exactly 0.75 goes to review**, and the backend does that (≤ 0.75). The WK3 prototype treats 0.75 as confirmed ("strictly below is low"). Align the UI with the requirement.
- **Confidence display:** show `confidence_score` (weakest indicator). The explanation names which indicator was weakest when an image is flagged.
- **Classification label:** every image is `fire` until the gate model exists, so the Archive (Not a fire) screen will stay empty from AI results for now.

## 4. Carried from Sprint 1

- Accessibility: no formal WCAG AA contrast measurement, no screen-reader testing, no non-visual equivalent of the map.
- Extinguished as model label vs coordinator action: resolution rule unspecified.
- Override vs regrouping behaviour: unresolved.
