import type { ReviewResult } from "@/types/review";

/**
 * Example payload in the exact shape the future resume-review service
 * should return. Quotes reference common resume section headings so the
 * demo shows something on most resumes; a real review will quote the
 * candidate's actual sentences.
 */
export const SAMPLE_REVIEW: ReviewResult = {
  documentName: "sample-resume.pdf",
  reviewedAt: "2026-07-04T00:00:00Z",
  annotations: [
    {
      id: "sample-1",
      quote: "Experience",
      category: "improve",
      message:
        "Lead each role with quantified impact (numbers, %, scale) instead of responsibilities.",
    },
    {
      id: "sample-2",
      quote: "Education",
      category: "suggestion",
      message:
        "If you have 3+ years of experience, consider moving Education below Experience.",
    },
    {
      id: "sample-3",
      quote: "Skills",
      category: "error",
      message:
        "Avoid long unordered skill dumps — group by proficiency and relevance to the target role.",
    },
    {
      id: "sample-4",
      quote: "Projects",
      category: "good",
      message: "Strong section — concrete projects differentiate candidates.",
    },
  ],
};
