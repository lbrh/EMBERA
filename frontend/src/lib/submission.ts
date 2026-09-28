import type { SourceType } from "@/lib/types";
import { OPERATING_REGION } from "@/lib/utils/geo";

// Checks for the Report a fire form, kept out of the page so they can be tested on their own.

export interface FormState {
  file: File | null;
  lat: string;
  lng: string;
  ts: string;
  notes: string;
  source: SourceType;
}

export const EMPTY: FormState = { file: null, lat: "", lng: "", ts: "", notes: "", source: "citizen" };

export type FieldName = "file" | "lat" | "lng" | "ts" | "notes";
export type FieldErrors = Partial<Record<FieldName, string>>;

const MAX_FILE_BYTES = 15 * 1024 * 1024; // backend/src/middleware/upload.middleware.ts
const IMAGE_TYPES = ["image/jpeg", "image/png"];
export const MAX_NOTES = 1000;
const MAX_AGE_DAYS = 30; // triage is near-real-time; older than this is almost certainly a typo
const DECIMAL = /^-?\d{1,3}(\.\d+)?$/;

/** A Date as the value a datetime-local input expects (local wall time, minutes precision). */
export function toLocalInput(date: Date): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

/** Every problem with the form, keyed by field; empty when it can be sent. Blank geotag/time is
 * allowed: the backend reads them from the image's EXIF and rejects the upload if they're missing
 * there too. Bounds and limits mirror the backend's own checks so a rejection there is rare. */
export function validate(form: FormState, now = new Date()): FieldErrors {
  const errors: FieldErrors = {};

  if (!form.file) {
    errors.file = "Attach an image to submit.";
  } else if (!IMAGE_TYPES.includes(form.file.type) && !/\.(jpe?g|png)$/i.test(form.file.name)) {
    errors.file = "Only JPEG or PNG images can be assessed.";
  } else if (form.file.size === 0) {
    errors.file = "That file is empty. Choose the image again.";
  } else if (form.file.size > MAX_FILE_BYTES) {
    errors.file = `That image is ${(form.file.size / 1024 / 1024).toFixed(1)} MB. The limit is 15 MB.`;
  }

  const { minLat, maxLat, minLon, maxLon } = OPERATING_REGION;
  const coord = (value: string, other: string, min: number, max: number, name: string) => {
    if (!value) return other ? `Enter the ${name} too, or leave both blank to use the image's geotag.` : undefined;
    if (!DECIMAL.test(value)) return `${name[0].toUpperCase()}${name.slice(1)} must be a decimal number, like ${name === "latitude" ? "-37.6214" : "145.3087"}.`;
    const n = Number(value);
    if (n < min || n > max) return `That's outside the operating region (Victoria): ${name} must be between ${min} and ${max}.`;
    return undefined;
  };
  const lat = coord(form.lat, form.lng, minLat, maxLat, "latitude");
  const lng = coord(form.lng, form.lat, minLon, maxLon, "longitude");
  if (lat) errors.lat = lat;
  if (lng) errors.lng = lng;

  if (form.ts) {
    const at = new Date(form.ts).getTime();
    if (Number.isNaN(at)) errors.ts = "Capture time isn't a valid date and time.";
    else if (at > now.getTime() + 5 * 60_000) errors.ts = "Capture time is in the future.";
    else if (at < now.getTime() - MAX_AGE_DAYS * 86_400_000) errors.ts = `Capture time is more than ${MAX_AGE_DAYS} days ago. Check the date.`;
  }

  if (form.notes.length > MAX_NOTES) errors.notes = `Notes are limited to ${MAX_NOTES} characters.`;
  return errors;
}
