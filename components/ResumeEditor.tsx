"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import {
  DEFAULT_KEYWORD_RULES,
  type KeywordRule,
} from "@/components/PdfKeywordHighlighter";

const PdfKeywordHighlighter = dynamic(
  () => import("@/components/PdfKeywordHighlighter"),
  {
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
        Preparing the PDF highlighter…
      </div>
    ),
  },
);

const PRESET_COLORS: { color: string; borderColor: string }[] = [
  {
    color: "rgba(255, 230, 109, 0.72)",
    borderColor: "rgba(181, 136, 0, 0.65)",
  },
  {
    color: "rgba(255, 92, 92, 0.72)",
    borderColor: "rgba(183, 28, 28, 0.75)",
  },
  {
    color: "rgba(94, 234, 212, 0.72)",
    borderColor: "rgba(15, 118, 110, 0.75)",
  },
  {
    color: "rgba(147, 197, 253, 0.72)",
    borderColor: "rgba(29, 78, 216, 0.75)",
  },
  {
    color: "rgba(216, 180, 254, 0.72)",
    borderColor: "rgba(126, 34, 206, 0.75)",
  },
];

function nextPreset(index: number) {
  return PRESET_COLORS[index % PRESET_COLORS.length];
}

export default function ResumeEditor() {
  const [file, setFile] = useState<File | null>(null);
  const [keywordRules, setKeywordRules] = useState<KeywordRule[]>(
    DEFAULT_KEYWORD_RULES,
  );

  const onUpload = (selected: File) => {
    setFile(selected);
  };

  const updateRule = (index: number, patch: Partial<KeywordRule>) => {
    setKeywordRules((rules) =>
      rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)),
    );
  };

  const removeRule = (index: number) => {
    setKeywordRules((rules) => rules.filter((_, i) => i !== index));
  };

  const addRule = () => {
    const preset = nextPreset(keywordRules.length);
    setKeywordRules((rules) => [
      ...rules,
      { term: "", color: preset.color, borderColor: preset.borderColor },
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
        <h1 style={{ marginTop: 0 }}>PDF Highlighter</h1>
        <p style={{ color: "#475569", lineHeight: 1.5 }}>
          Upload a PDF and edit the list below to control which exact words
          or phrases (even full sentences) get highlighted.
        </p>
        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload(f);
          }}
        />

        <h2 style={{ fontSize: 14, marginTop: 24, marginBottom: 8 }}>
          Keywords
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {keywordRules.map((rule, index) => (
            <div
              key={index}
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
                  background: rule.color,
                  border: `1px solid ${rule.borderColor}`,
                }}
              />
              <input
                type="text"
                value={rule.term}
                placeholder="keyword or sentence"
                onChange={(e) =>
                  updateRule(index, { term: e.target.value })
                }
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
                onClick={() => removeRule(index)}
                aria-label={`Remove ${rule.term || "keyword"}`}
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
          onClick={addRule}
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
          + Add keyword
        </button>
      </aside>

      <main style={{ padding: 16 }}>
        <PdfKeywordHighlighter file={file} keywordRules={keywordRules} />
      </main>
    </div>
  );
}
