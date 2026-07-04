"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { SAMPLE_REVIEW } from "@/lib/sampleReview";
import {
  CATEGORY_STYLES,
  type ReviewAnnotation,
  type ReviewResult,
} from "@/types/review";

const PdfReviewViewer = dynamic(() => import("@/components/PdfReviewViewer"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        minHeight: "calc(100vh - 32px)",
        display: "grid",
        placeItems: "center",
        border: "1px dashed rgba(0,0,0,0.15)",
        borderRadius: 24,
        background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
        color: "#475569",
      }}
    >
      Preparing the review viewer…
    </div>
  ),
});

type ManualMark = {
  id: string;
  quote: string;
};

let markCounter = 0;

function nextMarkId() {
  markCounter += 1;
  return `manual-${markCounter}`;
}

const LEGEND_CATEGORIES = ["error", "improve", "suggestion", "good"] as const;

export default function ResumeEditor() {
  const [file, setFile] = useState<File | null>(null);
  const [review, setReview] = useState<ReviewResult | null>(null);
  const [manualMarks, setManualMarks] = useState<ManualMark[]>([]);
  const [selectedAnnotation, setSelectedAnnotation] =
    useState<ReviewAnnotation | null>(null);

  // Future integration point: replace this with a call to the review
  // service (upload `file`, receive a ReviewResult) and setReview() it.
  const loadSampleReview = () => {
    setReview(SAMPLE_REVIEW);
  };

  const annotations = useMemo<ReviewAnnotation[]>(() => {
    const manual: ReviewAnnotation[] = manualMarks.map((mark) => ({
      id: mark.id,
      quote: mark.quote,
      category: "custom",
      message: undefined,
    }));
    return [...(review?.annotations ?? []), ...manual];
  }, [review, manualMarks]);

  const updateMark = (id: string, quote: string) => {
    setManualMarks((marks) =>
      marks.map((mark) => (mark.id === id ? { ...mark, quote } : mark)),
    );
  };

  const removeMark = (id: string) => {
    setManualMarks((marks) => marks.filter((mark) => mark.id !== id));
  };

  const addMark = () => {
    setManualMarks((marks) => [...marks, { id: nextMarkId(), quote: "" }]);
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "320px 1fr",
        minHeight: "100vh",
        background: "linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%)",
      }}
    >
      <aside
        style={{
          padding: 20,
          borderRight: "1px solid rgba(15, 23, 42, 0.08)",
          background: "rgba(255,255,255,0.75)",
          backdropFilter: "blur(12px)",
          overflowY: "auto",
        }}
      >
        <h1 style={{ marginTop: 0 }}>Resume Review</h1>
        <p style={{ color: "#475569", lineHeight: 1.5 }}>
          Upload a resume PDF. Review annotations mark areas to fix or
          improve, color-coded by severity; hover a highlight to read the
          reviewer&apos;s note.
        </p>
        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setFile(f);
          }}
        />

        <h2 style={{ fontSize: 14, marginTop: 24, marginBottom: 8 }}>
          Review
        </h2>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            fontSize: 13,
            color: "#475569",
          }}
        >
          {LEGEND_CATEGORIES.map((category) => {
            const style = CATEGORY_STYLES[category];
            return (
              <div
                key={category}
                style={{ display: "flex", alignItems: "center", gap: 8 }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 4,
                    flexShrink: 0,
                    background: style.color,
                    border: `1px solid ${style.borderColor}`,
                  }}
                />
                {style.label}
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={loadSampleReview}
          style={{
            marginTop: 12,
            width: "100%",
            border: "1px solid rgba(15, 23, 42, 0.15)",
            borderRadius: 8,
            background: "#0f172a",
            color: "#f8fafc",
            padding: "8px 10px",
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          {review ? "Reload sample review" : "Run review (sample)"}
        </button>
        {review && (
          <p style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>
            {review.annotations.length} annotation
            {review.annotations.length === 1 ? "" : "s"} loaded.
          </p>
        )}

        {selectedAnnotation && (
          <div
            style={{
              marginTop: 16,
              border: `1px solid ${
                CATEGORY_STYLES[selectedAnnotation.category].borderColor
              }`,
              borderRadius: 10,
              background: "rgba(255,255,255,0.8)",
              padding: "10px 12px",
              fontSize: 13,
              color: "#334155",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 6,
              }}
            >
              <strong>
                {CATEGORY_STYLES[selectedAnnotation.category].label}
              </strong>
              <button
                type="button"
                onClick={() => setSelectedAnnotation(null)}
                aria-label="Dismiss selection"
                style={{
                  border: "none",
                  background: "transparent",
                  color: "#94a3b8",
                  cursor: "pointer",
                  fontSize: 16,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
            <div
              style={{
                fontStyle: "italic",
                color: "#64748b",
                marginBottom: selectedAnnotation.message ? 6 : 0,
                overflowWrap: "anywhere",
              }}
            >
              “{selectedAnnotation.quote}”
            </div>
            {selectedAnnotation.message && (
              <div style={{ lineHeight: 1.5 }}>
                {selectedAnnotation.message}
              </div>
            )}
          </div>
        )}

        <h2 style={{ fontSize: 14, marginTop: 24, marginBottom: 8 }}>
          Manual marks
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {manualMarks.map((mark) => (
            <div
              key={mark.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: "rgba(255,255,255,0.6)",
                border: "1px solid rgba(15, 23, 42, 0.08)",
                borderRadius: 8,
                padding: "6px 8px",
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 4,
                  flexShrink: 0,
                  background: CATEGORY_STYLES.custom.color,
                  border: `1px solid ${CATEGORY_STYLES.custom.borderColor}`,
                }}
              />
              <input
                type="text"
                value={mark.quote}
                placeholder="word or sentence"
                onChange={(e) => updateMark(mark.id, e.target.value)}
                style={{
                  flex: 1,
                  minWidth: 0,
                  border: "1px solid rgba(15, 23, 42, 0.12)",
                  borderRadius: 6,
                  padding: "4px 6px",
                  fontSize: 13,
                }}
              />
              <button
                type="button"
                onClick={() => removeMark(mark.id)}
                aria-label={`Remove ${mark.quote || "mark"}`}
                style={{
                  border: "none",
                  background: "transparent",
                  color: "#94a3b8",
                  cursor: "pointer",
                  fontSize: 16,
                  lineHeight: 1,
                  padding: "0 4px",
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addMark}
          style={{
            marginTop: 10,
            width: "100%",
            border: "1px dashed rgba(15, 23, 42, 0.2)",
            borderRadius: 8,
            background: "transparent",
            color: "#475569",
            padding: "6px 8px",
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          + Add mark
        </button>
      </aside>

      <main style={{ padding: 16 }}>
        <PdfReviewViewer
          file={file}
          annotations={annotations}
          selectedAnnotationId={selectedAnnotation?.id ?? null}
          onAnnotationClick={setSelectedAnnotation}
        />
      </main>
    </div>
  );
}
