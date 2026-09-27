import { beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeIncident } from "../src/lib/normalize";
import { seedRecords } from "../src/lib/data-source/mock/seed";

// The store in real-API mode, with the server stubbed: `listIncidents` is what a poll reads, and
// `dispatchCrews` never settles so its incident stays "in flight".
const server = vi.hoisted(() => ({ listIncidents: vi.fn(), dispatchCrews: vi.fn(), getCrews: vi.fn(async () => []) }));
vi.mock("@/lib/data-source", () => ({
  dataSource: { ...server, getImagePreviewUrl: () => null },
  useMock: false,
  COORDINATOR_NAME: "EC",
  currentActor: () => "EC",
  getSeedDecisionLog: () => [],
  getSeedGroup: () => null,
}));

vi.mock("@/lib/utils/preload", () => ({ preloadImages: () => {} })); // needs a browser window

const { useIncidentStore } = await import("../src/lib/store/useIncidentStore");

const [a, b, c] = seedRecords.slice(0, 3).map((r) => normalizeIncident(r));

describe("refresh (live polling)", () => {
  beforeEach(() => {
    useIncidentStore.setState({ incidents: { [a.id]: a, [b.id]: b }, order: [a.id, b.id], initialized: true });
  });

  it("applies server changes, adds new incidents, and leaves an in-flight action alone", async () => {
    server.dispatchCrews.mockReturnValue(new Promise(() => {}));
    useIncidentStore.getState().dispatchCrews(a.id, ["crew-1"]); // optimistic: a is now "live", call still pending
    expect(useIncidentStore.getState().incidents[a.id].dispatch).toBe("live");

    server.listIncidents.mockResolvedValue([
      { ...a, dispatch: "awaiting" }, // stale server view of a: must not undo the click
      { ...b, place: "Renamed by server" },
      c,
    ]);
    await useIncidentStore.getState().refresh();

    const { incidents, order } = useIncidentStore.getState();
    expect(incidents[a.id].dispatch).toBe("live");
    expect(incidents[b.id].place).toBe("Renamed by server");
    expect(incidents[c.id]).toEqual(c);
    expect(order).toEqual([c.id, a.id, b.id]);
  });

  it("keeps what's shown when the server can't be reached", async () => {
    server.listIncidents.mockRejectedValue(new Error("offline"));
    await useIncidentStore.getState().refresh();
    expect(useIncidentStore.getState().incidents[b.id]).toEqual(b);
  });
});
