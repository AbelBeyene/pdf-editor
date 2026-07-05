/**
 * Integration contract for the resume-review pipeline.
 *
 * A review engine (human, rule-based, or LLM) produces a `ReviewResult`
 * whose annotations reference exact text quotes from the resume. The
 * viewer locates each quote in the PDF and marks it with the category's
 * color, showing `message` on hover.
 */

export type ReviewCategory =
  | "error" // factually wrong, typo, broken formatting — must fix
  | "improve" // weak phrasing, missing metrics — should update
  | "suggestion" // optional polish or alternative wording
  | "good" // strong content worth keeping
  | "custom"; // manual keyword/phrase marks from the UI

export type ReviewAnnotation = {
  id: string;
  /** Exact text from the resume to mark. Matched case-insensitively;
   * whitespace differences (line wraps) are tolerated. */
  quote: string;
  category: ReviewCategory;
  /** Reviewer explanation shown when hovering the highlight. */
  message?: string;
  /** How to draw a multi-word match: one continuous box per line
   * ("phrase", default) or an individual box around every word ("word") —
   * useful for e.g. flagging each word of an unfinished sentence. */
  granularity?: "phrase" | "word";
  /** Optional per-annotation style overrides (defaults come from category). */
  color?: string;
  borderColor?: string;
  /** How to draw the match itself: a filled box ("highlight", default) or
   * just a bottom border with no fill ("underline"). */
  displayStyle?: "highlight" | "underline";
};

export type ReviewResult = {
  documentName?: string;
  reviewedAt?: string;
  annotations: ReviewAnnotation[];
};

export type CategoryStyle = {
  label: string;
  color: string;
  borderColor: string;
};

export const CATEGORY_STYLES: Record<ReviewCategory, CategoryStyle> = {
  error: {
    label: "Fix",
    color: "rgba(255, 92, 92, 0.2)",
    borderColor: "rgba(183, 28, 28, 0.8)",
  },
  improve: {
    label: "Improve",
    color: "rgba(255, 170, 40, 0.2)",
    borderColor: "rgba(181, 106, 0, 0.85)",
  },
  suggestion: {
    label: "Consider",
    color: "rgba(90, 150, 255, 0.18)",
    borderColor: "rgba(29, 78, 216, 0.8)",
  },
  good: {
    label: "Strong",
    color: "rgba(80, 200, 140, 0.18)",
    borderColor: "rgba(21, 128, 61, 0.8)",
  },
  custom: {
    label: "Marked",
    color: "rgba(255, 210, 60, 0.22)",
    borderColor: "rgba(181, 136, 0, 0.8)",
  },
};

export function annotationStyle(annotation: ReviewAnnotation): CategoryStyle {
  const base = CATEGORY_STYLES[annotation.category];
  return {
    ...base,
    color: annotation.color ?? base.color,
    borderColor: annotation.borderColor ?? base.borderColor,
  };
}
