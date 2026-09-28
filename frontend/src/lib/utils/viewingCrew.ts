// Which crew this browser is viewing the Crew screen as. A per-browser convenience that stands in
// for each crew's own login, so it may be unavailable (private window): callers get null.
const KEY = "embera.crewId";

export function getViewingCrew(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setViewingCrew(crewId: string): void {
  try {
    localStorage.setItem(KEY, crewId);
  } catch {
    // not remembered; the Crew screen just asks again
  }
}
