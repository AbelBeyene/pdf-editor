"use client";

import { useEffect, useMemo, useState } from "react";
import type { PDFDocumentProxy } from "react-pdf-highlighter-extended/node_modules/pdfjs-dist";
import {
  MonitoredHighlightContainer,
  PdfHighlighter,
  PdfLoader,
  TextHighlight,
  useHighlightContainerContext,
} from "react-pdf-highlighter-extended";
import {
  buildAnnotationHighlights,
  type PositionedAnnotation,
} from "@/lib/annotationEngine";
import { CATEGORY_STYLES, type ReviewAnnotation } from "@/types/review";

const WORKER_SRC = new URL(
  "../node_modules/react-pdf-highlighter-extended/node_modules/pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

function AnnotationHighlightContainer({
  selectedAnnotationId,
  onAnnotationClick,
}: {
  selectedAnnotationId: string | null;
  onAnnotationClick?: (annotation: ReviewAnnotation) => void;
}) {
  const { highlight, isScrolledTo } =
    useHighlightContainerContext<PositionedAnnotation>();
  const { annotation } = highlight;
  const label = CATEGORY_STYLES[annotation.category].label;
  const isSelected = annotation.id === selectedAnnotationId;

  const tip = annotation.message ? (
    <div
      style={{
        maxWidth: 280,
        background: "#0f172a",
        color: "#f8fafc",
        borderRadius: 8,
        padding: "8px 10px",
        fontSize: 12,
        lineHeight: 1.45,
        boxShadow: "0 4px 16px rgba(15, 23, 42, 0.35)",
      }}
    >
      <strong
        style={{
          display: "block",
          marginBottom: 2,
          color: highlight.color,
          filter: "saturate(2) brightness(1.4)",
        }}
      >
        {label}
      </strong>
      {annotation.message}
    </div>
  ) : null;

  return (
    <MonitoredHighlightContainer
      highlightTip={
        tip
          ? { position: highlight.position, content: tip }
          : undefined
      }
    >
      <TextHighlight
        highlight={highlight}
        isScrolledTo={isScrolledTo}
        onClick={() => onAnnotationClick?.(annotation)}
        style={{
          background: highlight.color,
          border: isSelected
            ? `2px solid ${highlight.borderColor}`
            : `1px solid ${highlight.borderColor}`,
          boxShadow: isSelected
            ? `0 0 0 2px ${highlight.borderColor}`
            : undefined,
          borderRadius: 3,
          cursor: "pointer",
        }}
      />
    </MonitoredHighlightContainer>
  );
}

function PdfDocumentAnnotator({
  pdfDocument,
  annotations,
  selectedAnnotationId,
  onAnnotationClick,
}: {
  pdfDocument: PDFDocumentProxy;
  annotations: ReviewAnnotation[];
  selectedAnnotationId: string | null;
  onAnnotationClick?: (annotation: ReviewAnnotation) => void;
}) {
  const [highlights, setHighlights] = useState<PositionedAnnotation[]>([]);

  useEffect(() => {
    let cancelled = false;

    const loadHighlights = async () => {
      const nextHighlights = await buildAnnotationHighlights(
        pdfDocument,
        annotations,
      );
      if (!cancelled) {
        setHighlights(nextHighlights);
      }
    };

    loadHighlights();

    return () => {
      cancelled = true;
    };
  }, [pdfDocument, annotations]);

  return (
    <PdfHighlighter
      pdfDocument={pdfDocument}
      highlights={highlights}
      pdfScaleValue="page-width"
      utilsRef={() => {}}
      style={{
        height: "calc(100vh - 32px)",
        width: "100%",
        background: "#f3f4f6",
      }}
    >
      <AnnotationHighlightContainer
        selectedAnnotationId={selectedAnnotationId}
        onAnnotationClick={onAnnotationClick}
      />
    </PdfHighlighter>
  );
}

export default function PdfReviewViewer({
  file,
  annotations,
  selectedAnnotationId = null,
  onAnnotationClick,
}: {
  file: File | null;
  annotations: ReviewAnnotation[];
  selectedAnnotationId?: string | null;
  onAnnotationClick?: (annotation: ReviewAnnotation) => void;
}) {
  const fileUrl = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file],
  );

  useEffect(() => {
    return () => {
      if (fileUrl) URL.revokeObjectURL(fileUrl);
    };
  }, [fileUrl]);

  if (!fileUrl) {
    return (
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
        Upload a resume PDF to see review annotations.
      </div>
    );
  }

  return (
    <PdfLoader
      document={fileUrl}
      workerSrc={WORKER_SRC}
      beforeLoad={() => <div style={{ color: "#475569" }}>Loading PDF…</div>}
      errorMessage={(error) => (
        <div style={{ color: "#b91c1c" }}>{error.message}</div>
      )}
    >
      {(pdfDocument) => (
        <PdfDocumentAnnotator
          pdfDocument={pdfDocument}
          annotations={annotations}
          selectedAnnotationId={selectedAnnotationId}
          onAnnotationClick={onAnnotationClick}
        />
      )}
    </PdfLoader>
  );
}
