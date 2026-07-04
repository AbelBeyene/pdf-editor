"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { CATEGORY_STYLES, type ReviewAnnotation } from "@/types/review";

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
  color: string; // hex, from the color picker
  message: string;
  wordByWord: boolean;
};

let markCounter = 0;

function nextMarkId() {
  markCounter += 1;
  return `manual-${markCounter}`;
}

const MARK_COLOR_CYCLE = ["#ffd54d", "#ff5c5c", "#4dabf7", "#51cf66", "#cc5de8"];

function hexToRgba(hex: string, alpha: number) {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function ResumeEditor() {
  const [file, setFile] = useState<File | null>(null);
  const [manualMarks, setManualMarks] = useState<ManualMark[]>([]);
  const [selectedAnnotation, setSelectedAnnotation] =
    useState<ReviewAnnotation | null>(null);

  const annotations = useMemo<ReviewAnnotation[]>(
    () =>
      manualMarks.map((mark) => ({
        id: mark.id,
        quote: mark.quote,
        category: "custom",
        message: mark.message || undefined,
        granularity: mark.wordByWord ? "word" : "phrase",
        color: hexToRgba(mark.color, 0.5),
        borderColor: hexToRgba(mark.color, 0.9),
      })),
    [manualMarks],
  );

  const updateMark = (id: string, patch: Partial<ManualMark>) => {
    setManualMarks((marks) =>
      marks.map((mark) => (mark.id === id ? { ...mark, ...patch } : mark)),
    );
  };

  const removeMark = (id: string) => {
    setManualMarks((marks) => marks.filter((mark) => mark.id !== id));
  };

  const addMark = () => {
    setManualMarks((marks) => [
      ...marks,
      {
        id: nextMarkId(),
        quote: "",
        color: MARK_COLOR_CYCLE[marks.length % MARK_COLOR_CYCLE.length],
        message: "",
        wordByWord: false,
      },
    ]);
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
          Upload a resume PDF, then add marks below: pick a color, enter the
          word or sentence to highlight, and optionally a note shown when
          hovering or clicking the highlight.
        </p>
        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setFile(f);
          }}
        />

        {selectedAnnotation && (
          <div
            style={{
              marginTop: 16,
              border: `1px solid ${
                selectedAnnotation.borderColor ??
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

        <h2 style={{ fontSize: 14, marginTop: 24, marginBottom: 8 }}>Marks</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {manualMarks.map((mark) => (
            <div
              key={mark.id}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                background: "rgba(255,255,255,0.6)",
                border: "1px solid rgba(15, 23, 42, 0.08)",
                borderRadius: 8,
                padding: "8px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="color"
                  value={mark.color}
                  onChange={(e) => updateMark(mark.id, { color: e.target.value })}
                  aria-label="Highlight color"
                  style={{
                    width: 28,
                    height: 28,
                    flexShrink: 0,
                    border: "none",
                    background: "transparent",
                    padding: 0,
                    cursor: "pointer",
                  }}
                />
                <input
                  type="text"
                  value={mark.quote}
                  placeholder="word or sentence"
                  onChange={(e) => updateMark(mark.id, { quote: e.target.value })}
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
              <input
                type="text"
                value={mark.message}
                placeholder="tooltip note (optional)"
                onChange={(e) => updateMark(mark.id, { message: e.target.value })}
                style={{
                  border: "1px solid rgba(15, 23, 42, 0.12)",
                  borderRadius: 6,
                  padding: "4px 6px",
                  fontSize: 12,
                  color: "#475569",
                }}
              />
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12,
                  color: "#475569",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={mark.wordByWord}
                  onChange={(e) =>
                    updateMark(mark.id, { wordByWord: e.target.checked })
                  }
                />
                Mark word-by-word
              </label>
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
