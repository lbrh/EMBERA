import type { CSSProperties } from "react";
import type { DispatchState, PipelineFlag } from "@/lib/types";

interface Props {
  flag: PipelineFlag;
  dispatch: DispatchState;
  /** Still pending_review: the AI hasn't finished, so it isn't "flagged" yet. */
  assessing?: boolean;
}

/** One flag per image at any time. Dispatched replaces Processed once a crew is assigned, so the
 * dispatch state never overwrites the pipeline flag. */
export function StatusFlagChip({ flag, dispatch, assessing }: Props) {
  let label: string;
  let style: CSSProperties;

  if (dispatch === "archived") {
    label = "Archived";
    style = { color: "var(--muted)", background: "var(--surface-2)", borderColor: "var(--border-2)" };
  } else if (dispatch === "extinguished") {
    label = "Extinguished";
    style = { color: "var(--fg-4)", background: "var(--surface-2)", borderColor: "var(--border-2)" };
  } else if (dispatch === "live") {
    label = "Dispatched";
    style = { color: "var(--ok-fg)", background: "var(--ok-soft)", borderColor: "var(--ok-border)" };
  } else if (flag === "flagged_review") {
    label = assessing ? "AI assessing…" : "Flagged for review";
    style = {
      color: "var(--accent-fg)",
      background: "var(--accent-soft)",
      borderColor: "var(--accent-border)",
      borderStyle: "dashed",
    };
  } else if (flag === "not_a_fire") {
    label = "Not a fire";
    style = { color: "var(--muted)", background: "var(--surface-2)", borderColor: "var(--border-2)" };
  } else {
    label = "Processed";
    style = { color: "var(--fg-2)", background: "var(--surface-2)", borderColor: "var(--border)" };
  }

  return (
    <span className="chip chip--pill" style={style}>
      <span className="chip__dot" aria-hidden />
      {label}
    </span>
  );
}
