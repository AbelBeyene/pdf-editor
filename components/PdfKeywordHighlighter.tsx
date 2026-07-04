"use client";

import { useEffect, useState } from "react";
import type { PDFDocumentProxy } from "react-pdf-highlighter-extended/node_modules/pdfjs-dist";
import {
  PdfHighlighter,
  PdfLoader,
  TextHighlight,
  useHighlightContainerContext,
  type Highlight,
} from "react-pdf-highlighter-extended";

export type KeywordRule = {
  term: string;
  color: string;
  borderColor: string;
};

type KeywordHighlight = Highlight & {
  keyword: string;
  color: string;
  borderColor: string;
};

export const DEFAULT_KEYWORD_RULES: KeywordRule[] = [
  {
    term: "locations",
    color: "rgba(255, 255, 255, 0.92)",
    borderColor: "rgba(0, 0, 0, 0.45)",
  },
  {
    term: "when",
    color: "rgba(255, 230, 109, 0.72)",
    borderColor: "rgba(181, 136, 0, 0.65)",
  },
  {
    term: "Android",
    color: "rgba(255, 230, 109, 0.72)",
    borderColor: "rgba(181, 136, 0, 0.65)",
  },
  {
    term: "iOS",
    color: "rgba(255, 230, 109, 0.72)",
    borderColor: "rgba(181, 136, 0, 0.65)",
  },
  {
    term: "Clean",
    color: "rgba(255, 92, 92, 0.72)",
    borderColor: "rgba(183, 28, 28, 0.75)",
  },
];

const WORKER_SRC = new URL(
  "../node_modules/react-pdf-highlighter-extended/node_modules/pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();
const PAGE_SCALE = 1.4;

type RawTextItem = {
  str: string;
  transform: number[];
  width: number;
  height: number;
  fontName: string;
};

/** One PDF text run, located within the reconstructed page text string. */
type PageTextEntry = {
  item: RawTextItem;
  start: number;
  end: number;
};

/**
 * Reconstructs a page's reading-order text from its individual text runs so
 * multi-word phrases (which usually span several runs) can be searched as
 * one string, while keeping a mapping back to each run's on-page geometry.
 */
function buildPageText(items: RawTextItem[]) {
  const withText = items.filter((item) => item.str.length > 0);

  const sorted = [...withText].sort((a, b) => {
    const dy = b.transform[5] - a.transform[5];
    if (Math.abs(dy) > 2) return dy;
    return a.transform[4] - b.transform[4];
  });

  const lines: RawTextItem[][] = [];
  for (const item of sorted) {
    const line = lines[lines.length - 1];
    const last = line?.[line.length - 1];
    const sameLine =
      last &&
      Math.abs(last.transform[5] - item.transform[5]) <
        Math.max(last.height, item.height, 1) * 0.5;

    if (sameLine) {
      line.push(item);
    } else {
      lines.push([item]);
    }
  }

  let pageText = "";
  const entries: PageTextEntry[] = [];

  for (const line of lines) {
    for (const item of line) {
      const start = pageText.length;
      pageText += item.str;
      entries.push({ item, start, end: pageText.length });
      pageText += " ";
    }
  }

  return { pageText, entries };
}

/** Builds a case-insensitive matcher; single words get word-boundary checks
 * so they don't match inside a longer word, phrases match as free text. */
function buildTermMatcher(term: string) {
  const trimmed = term.trim();
  const escaped = trimmed
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");
  const isPhrase = /\s/.test(trimmed);
  return new RegExp(isPhrase ? escaped : `\\b${escaped}\\b`, "gi");
}

let measureContext: CanvasRenderingContext2D | null = null;

function getMeasureContext() {
  if (!measureContext) {
    measureContext = document.createElement("canvas").getContext("2d");
  }
  return measureContext;
}

function getItemFontSize(transform: number[]) {
  return Math.hypot(transform[0], transform[1]) || 1;
}

/**
 * Measures where a token sits within its text run using canvas font
 * metrics, then rescales against the item's true PDF advance width
 * (canvas fonts only approximate the embedded font).
 */
function measureTokenOffset(
  str: string,
  token: { start: number; end: number },
  fontFamily: string,
  transform: number[],
  itemWidth: number,
) {
  const ctx = getMeasureContext();
  if (!ctx) return null;

  const fontSize = getItemFontSize(transform);
  ctx.font = `${fontSize}px ${fontFamily}`;

  const fullWidth = ctx.measureText(str).width;
  if (!fullWidth) return null;

  const scale = itemWidth / fullWidth;
  const prefixWidth = ctx.measureText(str.slice(0, token.start)).width * scale;
  const tokenWidth =
    ctx.measureText(str.slice(token.start, token.end)).width * scale;

  return { offset: prefixWidth, width: tokenWidth };
}

function viewportRectToScaled(
  rect: {
    left: number;
    top: number;
    width: number;
    height: number;
    pageNumber: number;
  },
  viewport: { width: number; height: number },
) {
  return {
    x1: rect.left,
    y1: rect.top,
    x2: rect.left + rect.width,
    y2: rect.top + rect.height,
    width: viewport.width,
    height: viewport.height,
    pageNumber: rect.pageNumber,
  };
}

type ScaledRect = ReturnType<typeof viewportRectToScaled>;

/** Builds the scaled rect for a sub-range of one text run's characters,
 * using the run's exact box when the whole run is covered (no error), and
 * canvas-measured sub-positioning only for a partial run. */
function buildEntryRect(
  entry: PageTextEntry,
  localStart: number,
  localEnd: number,
  viewport: {
    width: number;
    height: number;
    convertToViewportPoint: (x: number, y: number) => number[];
  },
  pageNumber: number,
  styles: Record<string, { fontFamily: string } | undefined>,
): ScaledRect | null {
  const { str, transform, width, height, fontName } = entry.item;
  const [left, topAnchor] = viewport.convertToViewportPoint(
    transform[4],
    transform[5],
  );
  const viewportHeight = Math.max(height * PAGE_SCALE, 4);
  const top = topAnchor - viewportHeight;

  const isFullItem = localStart <= 0 && localEnd >= str.length;

  let offsetPdf = 0;
  let widthPdf = width;

  if (!isFullItem) {
    const fontFamily = styles[fontName]?.fontFamily ?? "sans-serif";
    const measured = measureTokenOffset(
      str,
      { start: Math.max(localStart, 0), end: Math.min(localEnd, str.length) },
      fontFamily,
      transform,
      width,
    );
    if (!measured) return null;
    offsetPdf = measured.offset;
    widthPdf = measured.width;
  }

  const viewportRect = {
    left: left + offsetPdf * PAGE_SCALE,
    top,
    width: Math.max(widthPdf * PAGE_SCALE, 4),
    height: viewportHeight,
    pageNumber,
  };

  return viewportRectToScaled(viewportRect, viewport);
}

function unionRects(rects: ScaledRect[]): ScaledRect {
  return {
    ...rects[0],
    x1: Math.min(...rects.map((r) => r.x1)),
    y1: Math.min(...rects.map((r) => r.y1)),
    x2: Math.max(...rects.map((r) => r.x2)),
    y2: Math.max(...rects.map((r) => r.y2)),
  };
}

function KeywordHighlightContainer() {
  const { highlight, isScrolledTo } =
    useHighlightContainerContext<KeywordHighlight>();

  return (
    <TextHighlight
      highlight={highlight}
      isScrolledTo={isScrolledTo}
      style={{
        background: highlight.color,
        border: `1px solid ${highlight.borderColor}`,
        borderRadius: 3,
      }}
    />
  );
}

async function buildKeywordHighlights(
  pdfDocument: PDFDocumentProxy,
  keywordRules: KeywordRule[],
) {
  const highlights: KeywordHighlight[] = [];
  const activeRules = keywordRules.filter((rule) => rule.term.trim());

  if (activeRules.length === 0) {
    return highlights;
  }

  const matchers = activeRules.map((rule) => ({
    rule,
    regex: buildTermMatcher(rule.term),
  }));

  for (
    let pageNumber = 1;
    pageNumber <= pdfDocument.numPages;
    pageNumber += 1
  ) {
    const page = await pdfDocument.getPage(pageNumber);
    const viewport = page.getViewport({ scale: PAGE_SCALE });
    const textContent = await page.getTextContent();
    const { pageText, entries } = buildPageText(
      textContent.items as RawTextItem[],
    );

    if (!pageText.trim()) continue;

    for (const { rule, regex } of matchers) {
      regex.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = regex.exec(pageText))) {
        const start = match.index;
        const end = start + match[0].length;

        const rects = entries
          .filter((entry) => entry.start < end && entry.end > start)
          .map((entry) =>
            buildEntryRect(
              entry,
              start - entry.start,
              end - entry.start,
              viewport,
              pageNumber,
              textContent.styles,
            ),
          )
          .filter((rect): rect is ScaledRect => rect !== null);

        if (rects.length === 0) continue;

        highlights.push({
          id: `${pageNumber}-${highlights.length}-${rule.term}`,
          type: "text",
          keyword: rule.term,
          color: rule.color,
          borderColor: rule.borderColor,
          content: { text: match[0] },
          position: {
            boundingRect: unionRects(rects),
            rects,
          },
        });
      }
    }
  }

  return highlights;
}

function PdfDocumentHighlighter({
  pdfDocument,
  keywordRules,
}: {
  pdfDocument: PDFDocumentProxy;
  keywordRules: KeywordRule[];
}) {
  const [highlights, setHighlights] = useState<KeywordHighlight[]>([]);

  useEffect(() => {
    let cancelled = false;

    const loadHighlights = async () => {
      const nextHighlights = await buildKeywordHighlights(
        pdfDocument,
        keywordRules,
      );
      if (!cancelled) {
        setHighlights(nextHighlights);
      }
    };

    loadHighlights();

    return () => {
      cancelled = true;
    };
  }, [pdfDocument, keywordRules]);

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
      <KeywordHighlightContainer />
    </PdfHighlighter>
  );
}

export default function PdfKeywordHighlighter({
  file,
  keywordRules,
}: {
  file: File | null;
  keywordRules: KeywordRule[];
}) {
  const [fileUrl, setFileUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setFileUrl(null);
      return;
    }

    const nextUrl = URL.createObjectURL(file);
    setFileUrl(nextUrl);

    return () => {
      URL.revokeObjectURL(nextUrl);
    };
  }, [file]);

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
        Upload a PDF to preview it with exact keyword highlights.
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
        <PdfDocumentHighlighter
          pdfDocument={pdfDocument}
          keywordRules={keywordRules}
        />
      )}
    </PdfLoader>
  );
}
