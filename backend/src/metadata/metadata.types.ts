// Field set per docs/live/metadata-schema.md; indicator labels per docs/live/severity-rubric.md.

// crew = a photo a response crew uploads from the fire (Crew tab).
export type SourceType = 'drone' | 'cctv' | 'citizen' | 'satellite' | 'crew';
export type UploadStatus = 'pending' | 'stored' | 'failed';
export type AssessmentStatus = 'assessed' | 'unable_to_assess' | 'pending_review';
export type ClassificationLabel = 'fire' | 'non_fire' | 'extinguished' | 'uncertain';
// archived: an extinguished fire the coordinator has filed away (moves from Resolved to Archive).
export type DispatchState = 'awaiting' | 'live' | 'extinguished' | 'archived';

export type SmokeDensity = 'none_or_haze' | 'moderate' | 'dense_dark' | 'very_dense_blocking_vision';
export type FlameVisibility =
    | 'no_visible_flame'
    | 'some_flame'
    | 'visible_high_flames_and_embers'
    | 'large_flame_wall_embers_everywhere';
// Amount of vegetation (fuel load) in frame, whether burning or not.
export type VegetationImpact = 'no_vegetation' | 'sparse_vegetation' | 'moderate_vegetation' | 'dense_vegetation';
// Amount of infrastructure in/near the scene, burning or not: fires near towns get higher priority.
export type InfrastructureImpact = 'no_infrastructure' | 'sparse_infrastructure' | 'moderate_infrastructure' | 'dense_infrastructure';

export interface ImageMetadata {
    incidentId: string;
    imageId: string;
    storagePath: string | null;
    timestamp: string;
    sourceType: SourceType;
    latitude: number;
    longitude: number;
    severityScore: number | null;
    // AI's own output, never overwritten in place — see severityScoreOverride.
    severityScoreOverride: number | null;
    overriddenBy: string | null;
    overriddenAt: string | null;
    confidenceScore: number | null;
    severityExplanation: string | null;
    smokeDensity: SmokeDensity | null;
    flameVisibility: FlameVisibility | null;
    vegetationImpact: VegetationImpact | null;
    infrastructureImpact: InfrastructureImpact | null;
    assessmentStatus: AssessmentStatus;
    classificationLabel: ClassificationLabel | null;
    // Coordinator's call, same pattern as severityScoreOverride: the AI's label is never overwritten.
    classificationLabelOverride: ClassificationLabel | null;
    priorityRank: number | null;
    uploadStatus: UploadStatus;
    ingestionError: string | null;
    contentHash: string | null;
    // Locality at the image's coordinates ("Kinglake"), looked up after ingest; null until then.
    placeName: string | null;
    // Weather and fire danger at the image's coordinates, looked up after ingest; null until then
    // (or if the weather service was unreachable).
    weather: FireWeather | null;
}

export interface FireWeather {
    observedAt: string;
    fetchedAt?: string; // when the app looked it up (absent on rows stored before the live refresh)
    temperatureC: number;
    humidityPct: number;
    windKmh: number;
    windFromDeg: number; // meteorological: the direction the wind blows FROM
    ffdi: number; // McArthur Forest Fire Danger Index, see pipeline/fire-weather.ts
    // The next hours' forecast (+1 h, +2 h), for the spread envelope to follow a wind change.
    // Absent on rows stored before it existed.
    nextHours?: FireWeatherHour[];
    // Set when the current conditions are a Bureau of Meteorology station's observation rather
    // than the forecast model's; the forecast hours always come from the model.
    station?: { name: string; distanceKm: number };
}

export type FireWeatherHour = Omit<FireWeather, 'observedAt' | 'fetchedAt' | 'nextHours' | 'station'> & { time: string };

// Read shape for the incident queries: an image plus its incident's dispatch state
// (null = no coordinator dispatch decision yet).
export interface IncidentImage extends ImageMetadata {
    dispatchState: DispatchState | null;
    dispatchUpdatedBy: string | null; // who set the current dispatch state, and when
    dispatchUpdatedAt: string | null;
}

// The fields a coordinator may change on an image. null clears an override (used by undo).
export interface CoordinatorPatch {
    severityScoreOverride?: 1 | 2 | 3 | 4 | null;
    classificationLabelOverride?: ClassificationLabel | null;
    assessmentStatus?: 'assessed' | 'unable_to_assess';
}

export interface Decision {
    id: number;
    incidentId: string;
    imageId: string | null;
    field: string;
    fromValue: string | null;
    toValue: string | null;
    decidedBy: string;
    decidedAt: string;
}

export interface Comment {
    id: number;
    incidentId: string;
    author: string;
    body: string;
    createdAt: string;
}

export type CrewType = 'light' | 'heavy' | 'aerial';
// dispatched -> en_route -> on_scene, and cleared from any of them (recalled, extinguished, false alarm).
export type AssignmentStatus = 'dispatched' | 'en_route' | 'on_scene' | 'cleared';

export interface Assignment {
    assignmentId: number;
    incidentId: string;
    crewId: string;
    status: AssignmentStatus;
    updatedAt: string;
}

// A crew with its station and its open assignment (null = available).
export interface CrewWithAssignment {
    crewId: string;
    label: string;
    crewType: CrewType;
    station: { stationId: string; name: string; latitude: number; longitude: number };
    assignment: Assignment | null;
}

export type SupportRequestStatus = 'open' | 'fulfilled' | 'dismissed';

export interface SupportRequest {
    id: number;
    incidentId: string;
    crewId: string;
    crewLabel: string;
    crewType: CrewType | null; // null = any crew
    note: string | null;
    status: SupportRequestStatus;
    createdAt: string;
}

export interface IngestionInput {
    sourceType: SourceType;
    latitude?: number;
    longitude?: number;
    timestamp?: string;
    incidentId?: string;
}
