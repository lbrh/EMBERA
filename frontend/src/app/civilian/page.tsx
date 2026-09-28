"use client";

import { useState, type ReactNode } from "react";
import { useIncidentStore } from "@/lib/store/useIncidentStore";
import { Button } from "@/components/primitives/Button";
import { EMPTY, MAX_NOTES, toLocalInput, validate, type FieldName, type FormState } from "@/lib/submission";

/** The public view: a member of the public reports a fire with a photo. Always filed as a
 * citizen upload; the result goes to the coordinators, not back to the reporter. */
export default function ReportFirePage() {
  const submitImage = useIncidentStore((s) => s.submitImage);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [status, setStatus] = useState<"idle" | "processing" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastRef, setLastRef] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  // a field shows its problem once it's been left (or on submit), not while it's being typed
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({});
  const errors = validate(form);
  const shown = (name: FieldName) => (touched[name] ? errors[name] : undefined);
  const touch = (name: FieldName) => setTouched((t) => ({ ...t, [name]: true }));
  function clearFields() {
    setForm(EMPTY);
    setTouched({});
    // the file input is uncontrolled; without this, re-picking the same photo fires no change
    const fileInput = document.getElementById("submit-file") as HTMLInputElement | null;
    if (fileInput) fileInput.value = "";
  }

  const steps: { label: string; done: boolean; running?: boolean }[] = [
    { label: "Attach image", done: !!form.file && !errors.file },
    { label: "Geotag + capture time", done: !!(form.lat && form.lng && form.ts) && !errors.lat && !errors.lng && !errors.ts },
    { label: "Checking the photo", done: status === "done", running: status === "processing" },
    { label: "Report received", done: status === "done" },
  ];

  async function handleSubmit() {
    const problems = validate(form);
    const first = (Object.keys(problems) as FieldName[])[0];
    if (first) {
      setTouched({ file: true, lat: true, lng: true, ts: true, notes: true });
      setError(null);
      document.getElementById(`submit-${first}`)?.focus();
      return;
    }
    setError(null);
    setStatus("processing");
    try {
      const file = form.file!; // validate() requires one
      const result = await submitImage({
        file,
        fileName: file.name,
        latitude: form.lat ? Number(form.lat) : undefined,
        longitude: form.lng ? Number(form.lng) : undefined,
        timestamp: form.ts ? new Date(form.ts).toISOString() : undefined,
        sourceType: form.source,
        notes: form.notes,
      });
      setLastRef(result.ref);
      setStatus("done");
      clearFields(); // so a confirmed report can't be sent twice by accident
    } catch (err) {
      setStatus("idle");
      setError(err instanceof Error ? err.message : "Submission failed.");
    }
  }

  function fillDeviceLocation() {
    if (!navigator.geolocation) {
      setError("This browser can't share its location. Enter the coordinates manually.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
      {
        setForm((f) => ({ ...f, lat: pos.coords.latitude.toFixed(5), lng: pos.coords.longitude.toFixed(5) }));
        setTouched((t) => ({ ...t, lat: true, lng: true }));
      },
      () => setError("Couldn't get the device location. Enter the coordinates manually.")
    );
  }

  return (
    <div
      className="page"
      style={{
        maxWidth: 1200,
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-5)",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        <h1 className="page-title">Report a fire</h1>
        <p className="page-lede">
          Send a photo of the fire and where you took it. It&apos;s checked and passed to the fire
          coordinators. Leave the location and time blank to read them from the photo. In an
          emergency, call 000 first.
        </p>
      </div>

      <form
        className="card"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
        style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}
      >
        {error ? (
          <div
            role="alert"
            style={{
              display: "flex",
              gap: "var(--space-3)",
              alignItems: "flex-start",
              margin: "var(--space-5) var(--space-5) 0",
              padding: "var(--space-3) var(--space-4)",
              background: "var(--err-bg)",
              border: "1px solid var(--err-border)",
              borderRadius: "var(--radius-md)",
            }}
          >
            <span
              aria-hidden
              style={{
                flex: "none",
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: "var(--hard-stop)",
                color: "var(--on-primary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                font: "700 13px/1 var(--font-plex-sans)",
              }}
            >
              !
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ font: "600 var(--text-sm)/1.35 var(--font-plex-sans)", color: "var(--err-fg)" }}>Submission rejected</span>
              <span style={{ font: "400 var(--text-sm)/1.45 var(--font-plex-sans)", color: "var(--err-fg-2)" }}>{error}</span>
            </div>
          </div>
        ) : null}

        {/* Progress sits beside the fields on desktop and across the top on a tablet; a phone puts
            a compact stepper on top (layout.css). */}
        <div className="submit-grid">
          <div className="submit-aside">
            <div className="submit-progress" style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              <h2 className="label">Progress</h2>
              <ol className="submit-steps" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {steps.map((step, i) => {
                  const lit = step.done || step.running;
                  return (
                    <li
                      key={step.label}
                      className="submit-step"
                      style={{
                        borderRadius: "var(--radius-md)",
                        background: lit ? "var(--ok-soft)" : "var(--surface)",
                        border: `1px solid ${lit ? "var(--ok-border)" : "var(--border)"}`,
                        transition: "background-color var(--dur) var(--ease), border-color var(--dur) var(--ease)",
                      }}
                    >
                      <span
                        className="data"
                        aria-hidden
                        style={{
                          width: 24,
                          height: 24,
                          flex: "none",
                          borderRadius: "50%",
                          background: step.done ? "var(--ok-fg)" : "var(--panel)",
                          border: `1px solid ${lit ? "var(--ok-fg)" : "var(--border-2)"}`,
                          color: step.done ? "var(--panel)" : lit ? "var(--ok-fg)" : "var(--muted)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          font: "600 var(--text-2xs)/1 var(--font-plex-mono)",
                        }}
                      >
                        {step.done ? "✓" : i + 1}
                      </span>
                      <span className="submit-step__label">{step.label}</span>
                      <span className="caption submit-step__status" style={{ fontSize: 12, color: step.running ? "var(--conf-mid)" : step.done ? "var(--ok-fg)" : undefined }}>
                        {step.running ? "Running" : step.done ? "Done" : "Waiting"}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>

          </div>

          <div className="submit-fields">
            <Field label="Image" required htmlFor="submit-file" error={shown("file")}>
              <label
                htmlFor="submit-file"
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  const file = e.dataTransfer.files[0];
                  if (file) setForm((f) => ({ ...f, file }));
                  touch("file");
                }}
                style={{
                  position: "relative",
                  border: `1.5px dashed ${shown("file") ? "var(--err-border)" : dragging || form.file ? "var(--accent)" : "var(--border-2)"}`,
                  borderRadius: "var(--radius-lg)",
                  background: dragging ? "var(--accent-soft)" : form.file ? "var(--grad-pending)" : "var(--surface)",
                  padding: "var(--space-5)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "var(--space-2)",
                  width: "100%",
                  minHeight: 148,
                  cursor: "pointer",
                  transition: "background-color var(--dur) var(--ease), border-color var(--dur) var(--ease)",
                }}
              >
                <input
                  id="submit-file"
                  type="file"
                  accept="image/jpeg,image/png"
                  aria-required="true"
                  aria-invalid={!!shown("file")}
                  aria-describedby={shown("file") ? "submit-file-error" : undefined}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) setForm((f) => ({ ...f, file }));
                    touch("file");
                  }}
                  style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}
                />
                <span
                  aria-hidden
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: "var(--radius-md)",
                    background: "var(--accent-soft)",
                    color: "var(--accent)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </span>
                <span style={{ font: "600 var(--text-sm)/1.3 var(--font-plex-sans)", color: "var(--fg)" }}>
                  {form.file?.name || (
                    <>
                      <span style={{ color: "var(--accent)" }}>Choose an image</span> or drag it here
                    </>
                  )}
                </span>
                <span className="caption" style={{ fontSize: 12 }}>
                  JPEG or PNG, up to 15 MB
                </span>
              </label>
            </Field>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-4)" }}>
              <Field label="Latitude" htmlFor="submit-lat" error={shown("lat")}>
                <input
                  id="submit-lat"
                  className="input"
                  inputMode="decimal"
                  autoComplete="off"
                  value={form.lat}
                  onChange={(e) => setForm((f) => ({ ...f, lat: e.target.value.trim() }))}
                  onBlur={() => touch("lat")}
                  aria-invalid={!!shown("lat")}
                  aria-describedby={shown("lat") ? "submit-lat-error" : undefined}
                  placeholder="-37.6214"
                />
              </Field>
              <Field label="Longitude" htmlFor="submit-lng" error={shown("lng")}>
                <input
                  id="submit-lng"
                  className="input"
                  inputMode="decimal"
                  autoComplete="off"
                  value={form.lng}
                  onChange={(e) => setForm((f) => ({ ...f, lng: e.target.value.trim() }))}
                  onBlur={() => touch("lng")}
                  aria-invalid={!!shown("lng")}
                  aria-describedby={shown("lng") ? "submit-lng-error" : undefined}
                  placeholder="145.3087"
                />
              </Field>
            </div>
            <button type="button" className="btn btn--link tap-link" onClick={fillDeviceLocation} style={{ alignSelf: "flex-start", marginTop: -8, fontSize: "var(--text-xs)" }}>
              Use device location
            </button>

            <Field label="Capture time" hint="Local time" htmlFor="submit-ts" error={shown("ts")}>
              <input
                id="submit-ts"
                type="datetime-local"
                className="input"
                value={form.ts}
                max={toLocalInput(new Date())}
                onChange={(e) => setForm((f) => ({ ...f, ts: e.target.value }))}
                onBlur={() => touch("ts")}
                aria-invalid={!!shown("ts")}
                aria-describedby={shown("ts") ? "submit-ts-error" : undefined}
              />
            </Field>
            <button
              type="button"
              className="btn btn--link tap-link"
              onClick={() => {
                setForm((f) => ({ ...f, ts: toLocalInput(new Date()) }));
                touch("ts");
              }}
              style={{ alignSelf: "flex-start", marginTop: -8, fontSize: "var(--text-xs)" }}
            >
              Use current time
            </button>

            <Field label="Notes" hint={`Optional · ${form.notes.length}/${MAX_NOTES}`} htmlFor="submit-notes" error={shown("notes")}>
              <textarea
                id="submit-notes"
                className="input"
                rows={4}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                onBlur={() => touch("notes")}
                aria-invalid={!!shown("notes")}
                aria-describedby={shown("notes") ? "submit-notes-error" : undefined}
                placeholder="Observed conditions, access, hazards"
              />
            </Field>
          </div>
        </div>

        {status === "processing" || status === "done" ? (
          <div
            role="status"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-3)",
              margin: "0 var(--space-5) var(--space-4)",
              padding: "var(--space-3) var(--space-4)",
              background: "var(--ok-soft)",
              border: "1px solid var(--ok-border)",
              borderRadius: "var(--radius-md)",
            }}
          >
            <span
              aria-hidden
              style={{
                width: 18,
                height: 18,
                borderRadius: "50%",
                flex: "none",
                border: "2px solid var(--ok-fg)",
                borderTopColor: status === "done" ? "var(--ok-fg)" : "transparent",
                background: status === "done" ? "var(--ok-fg)" : "transparent",
                animation: status === "processing" ? "spin 0.8s linear infinite" : undefined,
              }}
            />
            <span style={{ font: "600 var(--text-sm)/1.4 var(--font-plex-sans)", color: "var(--ok-fg)" }}>
              {status === "done" ? "Report received" : "Checking your photo…"}
              {lastRef ? <span className="data" style={{ fontFamily: "var(--font-plex-mono)", fontWeight: 500 }}> · ref {lastRef}</span> : null}
            </span>
          </div>
        ) : null}

        <div
          className="submit-footer"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-4)",
            padding: "var(--space-4) var(--space-5)",
            borderTop: "1px solid var(--border)",
            background: "var(--surface)",
          }}
        >
          <Button type="submit" variant="primary" disabled={status === "processing"}>
            {status === "processing" ? "Sending…" : "Send report"}
          </Button>
          <button
            type="button"
            className="btn btn--quiet tap-link"
            onClick={() => {
              clearFields();
              setError(null);
              setStatus("idle");
            }}
          >
            {status === "done" ? "Report another" : "Clear form"}
          </button>
          <span className="caption" style={{ marginLeft: "auto" }}>
            {status === "done" && lastRef ? "Thanks, the coordinators have it." : form.file ? "Ready to submit" : "An image is required"}
          </span>
        </div>
      </form>

    </div>
  );
}

function Field({
  label,
  hint,
  required,
  htmlFor,
  error,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  htmlFor: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
      <label htmlFor={htmlFor} className="label" style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
        {label}
        {required ? <span style={{ color: "var(--err-fg)", fontWeight: 500 }}>Required</span> : null}
        {hint ? <span style={{ color: "var(--muted)", fontWeight: 400 }}>{hint}</span> : null}
      </label>
      {children}
      {error ? (
        <span id={`${htmlFor}-error`} role="alert" style={{ font: "500 var(--text-xs)/1.4 var(--font-plex-sans)", color: "var(--err-fg)" }}>
          {error}
        </span>
      ) : null}
    </div>
  );
}
