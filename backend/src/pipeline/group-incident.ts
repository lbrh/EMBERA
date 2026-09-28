import * as metadataRepository from '../metadata/metadata.repository.ts';
import { haversineKm } from '../utils/geo.ts';

const RADIUS_KM = 2;
const WINDOW_HOURS = 6;

// Hybrid auto-grouping rule (docs/decisions/decision-log.md D-02): attach to the nearest
// existing incident if its most recent image is within 2km and 6 hours, else the caller
// starts a new incident. A coordinator confirming/splitting a wrong auto-group is a
// separate, not-yet-built feature (that's UI, not ingestion).
export async function findIncidentToAttachTo(latitude: number, longitude: number, timestamp: string): Promise<string | null> {
    const candidates = await metadataRepository.findLatestImagePerIncident();
    const newTime = new Date(timestamp).getTime();

    let nearest: { incidentId: string; distanceKm: number } | null = null;
    for (const candidate of candidates) {
        const hoursApart = Math.abs(newTime - new Date(candidate.timestamp).getTime()) / 3_600_000;
        if (hoursApart > WINDOW_HOURS) continue;

        const distanceKm = haversineKm(latitude, longitude, candidate.latitude, candidate.longitude);
        if (distanceKm > RADIUS_KM) continue;

        if (!nearest || distanceKm < nearest.distanceKm) {
            nearest = { incidentId: candidate.incidentId, distanceKm };
        }
    }

    return nearest?.incidentId ?? null;
}
