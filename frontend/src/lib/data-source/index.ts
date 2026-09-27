import * as mockApi from "./mock/mockApi";
import * as realApi from "./real/api";

// Mock is opt-in: a build that forgets the flag must show real incidents, never the demo seed data.
export const useMock = process.env.NEXT_PUBLIC_USE_MOCK_API === "true";

export const dataSource = useMock ? mockApi : realApi;
export { getSeedDecisionLog, getSeedGroup } from "./mock/mockApi";
export { COORDINATOR_NAME, currentActor, setActor } from "./real/api";
export type { SubmitImagePayload, GroupAction } from "./mock/mockApi";
