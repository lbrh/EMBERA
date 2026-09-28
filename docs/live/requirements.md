# Requirements and Acceptance Criteria

**Status:** Live. Consolidates every requirements doc from Sprint 1 and Sprint 2 Week 1 into the current set. Build status is as of the date below.
**Owner:** Aryaveer Singh (BA). Consolidated by Liam Robinson Hounsell (Dev 2); items marked **(pending BA)** changed after the BA's last document and need sign-off.
**Last updated:** 2026-09-25
**Project:** EMBERA (Emergency Monitoring for Bushfire Evaluation, Response and Awareness) · **Client:** IBM (Naresh Olladapu, technical supervisor; Emily Chin, non-technical supervisor) · **Team:** Team 8, Team B

Sources: [Week 1 users & requirements](../archive/sprint-1/requirements/week-1/Define_Target_Users_&_Core_Requirements.md) · [Week 2 user stories](../archive/sprint-1/requirements/week-2/Refine%20User%20Stories%2C%20Requirements%20%26%20Traceability.md) · [Sprint 1 final](../archive/sprint-1/requirements/final/Sprint1_AI_Req_Acceptance_Criteria.md) · [Sprint 2 W1](../archive/sprint-2/week-1/Sprint2_Implementation_Requirements_&_Acceptance_Criteria.md)

---

## 1. Users

- **Primary:** emergency incident coordinators. Need one map of all reports, severity at a glance, a ranked order of where to send crews, and the reasoning behind each tag.
- **Secondary:** field response teams. Receive information from coordinators, never use the system directly, so status must never be ambiguous or stale.
- **Automated submitters:** drone, CCTV, satellite and partner systems calling the ingestion API directly. They submit images and do not need results back.
- No real users or live data are available; all users, locations and feeds are simulated.

## 2. Functional requirements and build status

| FR | Requirement | Priority | Backend | Frontend |
|---|---|---|---|---|
| FR1 | Submit a geotagged, timestamped image; reject with a clear message if either is missing | Must | ✅ `POST /ingest` (EXIF fills gaps, Victoria bounding box) | ❌ |
| FR2 | Every image processed by AI automatically and given a severity tag | Must | 🟡 Classifiers run on upload; vegetation/infrastructure models awaiting retrain, fire gate not built | — |
| FR3 / FR6 | Detailed report per incident with location, severity, confidence, time, status on top; opens on marker click | Must | ✅ `GET /incidents/:id` | ❌ |
| FR4 / FR15 | Every incident as a map marker; clustered at default zoom, expands on zoom | Must | ✅ `GET /incidents?minLat…` | ❌ |
| FR5 / FR16 | Severity distinguishable by colour, number and size from the map alone | Must | — | ❌ |
| FR7 | Map keeps old incidents and shows new ones without reload | Must | ✅ (poll `/incidents`) | ❌ |
| FR8 | Ranked operation order, severity first then proximity | Should | 🟡 `GET /order` sorts by `priority_rank`, but ranking not computed (all null) | ❌ |
| FR9 | Each ranked incident explains its position using the indicators | Should | 🟡 `severity_explanation` built; ranking reason not built | ❌ |
| FR10 / FR13 | Low-confidence images routed to manual review, never shown as confirmed | Must | ✅ `assessment_status` routing | ❌ review queue |
| FR11 | Four input methods (manual, drone, satellite, bulk/API) through one pipeline | Must | ✅ one API, `source_type` enum | ❌ |
| FR12 | Hybrid incident grouping: auto-group, coordinator confirms or splits | Must | ✅ auto-group (2 km / 6 h, open incidents only); `POST /incidents/:id/merge`, `POST /images/:id/split` | ✅ "Same fire?" merge and gallery split on the incident page |
| FR14 | Immediate override with undo and 5 s toast, logged (original, new, who, when) | Must | ✅ `PATCH /images/:id/decision`, every change logged in `decisions` (who is unverified until login exists) | ✅ override, undo and 5 s toast wired to the API |

## 3. AI input and output

**Input:** any image type (PNG/JPEG), with lat/long and timestamp. No minimum resolution; low-quality images go to review rather than being rejected. Max upload 15 MB.

**Output per image:**

| Output | Status |
|---|---|
| Fire / non-fire classification before severity scoring | 🟡 Rule, not a model: smoke or flame at 2–4 = fire; both at 1 = uncertain → manual review (D-33). |
| Severity 1 (Moderate) to 4 (Catastrophic) per the [severity rubric](severity-rubric.md) | ✅ |
| Confidence 0 to 1, always shown with the tag | ✅ (min of indicator confidences) |
| Plain-language explanation naming the driving indicators | ✅ |
| Status flag: Processed / Flagged for Manual Review / Dismissed | ✅ as `assessment_status` (`assessed` / `unable_to_assess` / `pending_review`); Dismissed needs the gate |

The result is written to the stored record in the background. Submitters get the record back immediately with `pending_review`; the score is read later from `/incidents` or `/order`. See [decision log](../decisions/decision-log.md) D-21.

## 4. Incident lifecycle

| Status | Meaning |
|---|---|
| **Fire** | Active fire confirmed by AI or reviewer. On the map and in the dispatch order. |
| **Non-Fire** | Not a fire, at intake or on review. Moves to Archive; retained and reopenable. |
| **Uncertain** | Confidence ≤ 0.75 at the gate or severity stage. In Manual Review only, never on the map as confirmed. |
| **Extinguished** | A real fire reported out by the crew. Moves to Resolved; reopens to Fire if a later image shows re-ignition. |

Flow: submission → fire gate (≤ 0.75 → Uncertain; confident non-fire → Archive) → severity scoring (≤ 0.75 → Uncertain) → Fire. Archive and Resolved are separate lists; nothing is deleted.

Build status: `classification_label` supports all four values. Archive (discard), Resolved (extinguish) and reopen are built as coordinator actions (`classification_label_override`, `incident_dispatch`). The fire gate is the smoke/flame rule (D-33): it only produces `fire` or `uncertain`, so nothing is dismissed without a reviewer.

**Acceptance criteria:**
1. Every submission resolves to Fire, Non-Fire or Uncertain, never unclassified.
2. Uncertain is visually distinct and never shown as confirmed until reviewed.
3. A crew-reported fire moves to Extinguished/Resolved and leaves the active map and order.
4. Extinguished can reopen to Fire on re-ignition.
5. Full history stays retrievable after Resolved or Archive.
6. Nothing is deleted outright.

## 5. Manual review and override

- Reviewer sees the image, the AI's provisional tag, its confidence and the reason for flagging.
- Reviewer can confirm the tag, change the severity and promote to an incident, or discard as not a fire (→ Archive).
- Override: immediate, no confirmation click, undo available, non-blocking toast top right for about 5 s. Logged with original tag, new value, who and when. The AI's original `severity_score` is never overwritten; the override lives in `severity_score_override`.

## 6. Non-functional requirements

| NFR | Target | Status |
|---|---|---|
| NFR1 latency | Submission to severity tag ≤ 2 minutes | AI stage measured 28 Sep 2026 (four watsonx deployments in parallel + fire-weather lookup, 12 demo images, Melbourne → ca-tor): median 1.9 s, p90 2.4 s warm; 6.0 s cold (first call fetches the IAM token). Upload, storage and the database write are not yet timed. |
| NFR2 severity accuracy | Precision ≥ 0.80, recall ≥ 0.75 vs a labelled test set | Not yet measured; needs retrained models and a human-checked test set. |
| **Fire gate miss rate (pending BA)** | ≥ 98% of real fires classified Fire (≤ 2% missed) on ≥ 300 fire test images; non-fire only accepted at ≥ 0.95 confidence | **Proposed** 2026-09-24, see D-25. Current NFR2 recall of 0.75 would allow 1 in 4 fires to be dismissed. |
| Confidence honesty | 100% of low-confidence images routed to review | Built (≤ 0.75 rule). |
| Override | Immediate, undo available | Built. |
| Map clarity | Zero overlapping markers at default zoom | Not built. |
| No data loss | Nothing lost between submission and storage | Record written before upload; failed uploads kept with `ingestion_error`. |
| Load tolerance | Survive a spike of simultaneous submissions | Grouping is locked against races; rate limit 600 reads + 60 writes per minute per caller and client IP (D-29). |
| Graceful degradation | Clear error rather than silent failure | Classification failures move the record to `unable_to_assess` (manual review) and are logged. An assessment killed mid-flight is swept there after 10 min. |

All targets are team-proposed and not client-confirmed.

## 7. Edge cases

- Exact duplicate resubmission (same bytes): returns the existing record, no second incident. ✅ (MD5 `content_hash`)
- Same incident, different severity: grouped under one incident; display the most recent or most severe, keep full history.
- Confidence exactly 0.75: manual review. ✅
- Corrupted/unreadable file: rejected with 400 "image file is corrupt or unreadable, please upload it again" before anything is stored; logged as a warning. ✅
- Override persists when a new image with a different AI severity arrives, until cleared. ❌
- Submission spike: no crash, freeze or silent drop.
- Secondary users always see the current (overridden) status.

## 8. Traceability

| Pain point | Requirements | Feature | Success criterion |
|---|---|---|---|
| Information overload | FR3, FR6, FR8 | Report + prioritised list | Top incident identifiable without scanning |
| Rankings distrusted | FR9, FR14 | Explanation + immediate override with undo | Reason on click; override reversible |
| Alerts all look alike | FR5, FR16 | Distinct severity colour/size | Severity readable from map alone (≥ 90% in usability test) |
| Map clutter | FR4, FR15 | Clustering | 0 overlapping markers at default zoom |
| AI confidence hidden | FR10, FR13 | Confidence + review queue | 100% low-confidence routed |
| Systems don't talk | FR1, FR11 | One ingestion API | ≥ 3 input channels without reformatting |
| False positives shown as fires | AI output 1 | Fire gate before scoring | No non-fire image shown as active |
| Uncertain treated as confirmed | Confidence routing | Threshold + review queue | Nothing ≤ 0.75 shown as confirmed |

## 9. Requirement change log

| Date | Change | Raised with |
|---|---|---|
| Sprint 1 W2 | Four input methods; FR11–FR16 added; override one click + confirm. | Client, UX |
| Sprint 1 final | Override changed to immediate + undo (no confirm click). People proximity as fourth element; total 4–16. | Benjamin (UX) |
| Sprint 2 W1 | Two confidence figures: gate (backend only) and severity (shown). | Liam, Benjamin |
| Sprint 2 W1 | Extinguished / Resolved lifecycle separate from Non-Fire / Archive. | Benjamin |
| 2026-09-24 | Rubric: people proximity dropped; vegetation = amount; infrastructure = amount nearby; vegetation gated on smoke/flame; total 3–16. **(pending BA)** | Dev team |
| 2026-09-24 | Proposed fire-gate target ≥ 98% fire recall with asymmetric threshold. **(pending BA / client)** | Dev team |
| 2026-09-24 | Submitters do not receive the score from `/ingest`; results are read from `/incidents` and `/order`. | Dev team |
