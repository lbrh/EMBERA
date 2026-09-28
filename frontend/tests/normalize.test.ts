import { expect, it } from "vitest";
import { normalizeIncident } from "../src/lib/normalize";
import { seedRecords } from "../src/lib/data-source/mock/seed";

it("shows a pending_review image as AI assessing, and a failed one as needing review", () => {
  const assessing = normalizeIncident({ ...seedRecords[0], assessmentStatus: "pending_review" });
  expect(assessing.flag).toBe("flagged_review");
  expect(assessing.reviewReason).toBe("ai_assessing");

  const failed = normalizeIncident({ ...seedRecords[0], assessmentStatus: "unable_to_assess" });
  expect(failed.reviewReason).not.toBe("ai_assessing");
});
