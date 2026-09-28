"use client";

import { useState, type FormEvent } from "react";
import type { DecisionLogEntry, IncidentComment } from "@/lib/types";
import { useIncidentStore } from "@/lib/store/useIncidentStore";
import { formatClock } from "@/lib/utils/time";
import { Button } from "@/components/primitives/Button";

const MAX_COMMENT = 1000;

type Item = { kind: "decision"; entry: DecisionLogEntry } | { kind: "comment"; entry: IncidentComment };

/** One timeline per incident: comments and coordinator decisions, newest first. Comments are a
 * permanent log, like decisions: there's no edit or delete. */
export function ActivityFeed({
  incidentId,
  decisions,
  comments,
}: {
  incidentId: string;
  decisions: DecisionLogEntry[];
  comments: IncidentComment[];
}) {
  const addComment = useIncidentStore((s) => s.addComment);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const items: Item[] = [
    ...decisions.map((entry): Item => ({ kind: "decision", entry })),
    ...comments.map((entry): Item => ({ kind: "comment", entry })),
  ].sort((a, b) => (a.entry.whenIso < b.entry.whenIso ? 1 : -1));

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const body = draft.trim();
    if (!body || saving) return;
    setSaving(true);
    if (await addComment(incidentId, body)) setDraft(""); // on failure the draft stays for a retry
    setSaving(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        <textarea
          className="input"
          rows={2}
          maxLength={MAX_COMMENT}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
          aria-label="Add a comment"
          placeholder="Add a comment for everyone on this incident"
        />
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "var(--space-2)" }}>
          <span className="caption">Comments are permanent. Ctrl or ⌘ + Enter to post.</span>
          <Button type="submit" small disabled={!draft.trim() || saving}>
            {saving ? "Posting…" : "Post comment"}
          </Button>
        </div>
      </form>

      {items.length === 0 ? (
        <p className="caption">No comments or coordinator decisions on this incident yet.</p>
      ) : (
        <ol className="card card--inset" style={{ listStyle: "none", margin: 0, padding: "0 var(--space-4)" }}>
          {items.map((item, i) => (
            <li
              key={`${item.kind}-${item.entry.id}`}
              style={{
                display: "flex",
                flexWrap: "wrap", // on a phone, who and when drop below the entry instead of overflowing
                justifyContent: "space-between",
                columnGap: "var(--space-4)",
                rowGap: 2,
                padding: "10px 0",
                borderBottom: i < items.length - 1 ? "1px solid var(--border)" : "none",
              }}
            >
              {item.kind === "comment" ? (
                <span style={{ font: "400 var(--text-sm)/1.5 var(--font-plex-sans)", color: "var(--fg)", whiteSpace: "pre-wrap", flex: "1 1 220px", minWidth: 0, overflowWrap: "anywhere" }}>
                  <span className="label" style={{ marginRight: "var(--space-2)" }}>Comment</span>
                  {item.entry.body}
                </span>
              ) : (
                <span style={{ font: "400 var(--text-sm)/1.5 var(--font-plex-sans)", color: "var(--fg-2)", flex: "1 1 220px", minWidth: 0 }}>
                  {item.entry.summary}
                </span>
              )}
              <span
                className="data"
                style={{
                  flex: "none",
                  marginLeft: "auto",
                  textAlign: "right",
                  font: "400 var(--text-2xs)/1.6 var(--font-plex-mono)",
                  color: "var(--muted)",
                  whiteSpace: "nowrap",
                }}
              >
                {item.entry.who} · {formatClock(item.entry.whenIso)} AEST
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
