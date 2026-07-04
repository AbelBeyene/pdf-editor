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
  /** Optional per-annotation style overrides (defaults come from category). */
  color?: string;
  borderColor?: string;
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
    color: "rgba(255, 92, 92, 0.55)",
    borderColor: "rgba(183, 28, 28, 0.75)",
  },
  improve: {
    label: "Improve",
    color: "rgba(255, 200, 60, 0.55)",
    borderColor: "rgba(181, 136, 0, 0.75)",
  },
  suggestion: {
    label: "Consider",
    color: "rgba(120, 170, 255, 0.5)",
    borderColor: "rgba(29, 78, 216, 0.7)",
  },
  good: {
    label: "Strong",
    color: "rgba(110, 220, 160, 0.5)",
    borderColor: "rgba(21, 128, 61, 0.7)",
  },
  custom: {
    label: "Marked",
    color: "rgba(255, 230, 109, 0.6)",
    borderColor: "rgba(181, 136, 0, 0.65)",
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
