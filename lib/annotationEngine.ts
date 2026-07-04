/**
 * Locates review annotations (exact text quotes) inside a rendered PDF and
 * produces positioned highlights for react-pdf-highlighter-extended.
 */

import type { PDFDocumentProxy } from "react-pdf-highlighter-extended/node_modules/pdfjs-dist";
import type { Highlight } from "react-pdf-highlighter-extended";
import { annotationStyle, type ReviewAnnotation } from "@/types/review";

export type PositionedAnnotation = Highlight & {
  annotation: ReviewAnnotation;
  color: string;
  borderColor: string;
};

const PAGE_SCALE = 1.4;
/** Text runs are baseline-anchored and `height` only covers the ascent, so
 * extend the box below the baseline to also cover descenders (g, y, p). */
const DESCENDER_RATIO = 0.22;
/** Horizontal padding added to each side of the box, as a fraction of the
 * line height, so the marking doesn't hug the glyph edges. */
const SIDE_PAD_RATIO = 0.12;

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
 * multi-word quotes (which usually span several runs) can be searched as
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
function buildQuoteMatcher(quote: string) {
  const trimmed = quote.trim();
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
  const ascentHeight = Math.max(height * PAGE_SCALE, 4);
  const viewportHeight = ascentHeight * (1 + DESCENDER_RATIO);
  const top = topAnchor - ascentHeight;

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

  const sidePad = ascentHeight * SIDE_PAD_RATIO;
  const viewportRect = {
    left: left + offsetPdf * PAGE_SCALE - sidePad,
    top,
    width: Math.max(widthPdf * PAGE_SCALE, 4) + sidePad * 2,
    height: viewportHeight,
    pageNumber,
  };

  return viewportRectToScaled(viewportRect, viewport);
}

/** Splits [start, end) of `text` into the ranges of its individual words. */
function wordRanges(text: string, start: number, end: number) {
  const ranges: { start: number; end: number }[] = [];
  const regex = /\S+/g;
  let match: RegExpExecArray | null;
  const slice = text.slice(start, end);
  while ((match = regex.exec(slice))) {
    ranges.push({
      start: start + match.index,
      end: start + match.index + match[0].length,
    });
  }
  return ranges;
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

/** One matched text segment in PDF user-space coordinates (origin at the
 * page's bottom-left, y up), as used by pdf-lib for editing. */
export type PdfTextSegment = {
  pageNumber: number; // 1-based
  x: number;
  baselineY: number;
  width: number;
  height: number; // ascent above the baseline
  fontSize: number;
  /** pdf.js internal font resource id (key into page.commonObjs). */
  fontName: string;
  /** CSS generic family pdf.js inferred ("serif" | "sans-serif" | "monospace"). */
  fontFamily: string;
};

export type PdfTextMatch = {
  text: string;
  segments: PdfTextSegment[];
};

/**
 * Finds every occurrence of `quote` in the document and returns its
 * geometry in PDF user-space, one segment per underlying text run
 * (a match wrapping across lines yields multiple segments).
 */
export async function findTextInPdf(
  pdfDocument: PDFDocumentProxy,
  quote: string,
): Promise<PdfTextMatch[]> {
  const matches: PdfTextMatch[] = [];
  if (!quote.trim()) return matches;

  const regex = buildQuoteMatcher(quote);

  for (
    let pageNumber = 1;
    pageNumber <= pdfDocument.numPages;
    pageNumber += 1
  ) {
    const page = await pdfDocument.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const { pageText, entries } = buildPageText(
      textContent.items as RawTextItem[],
    );

    regex.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(pageText))) {
      const start = match.index;
      const end = start + match[0].length;
      const segments: PdfTextSegment[] = [];

      for (const entry of entries) {
        if (entry.start >= end || entry.end <= start) continue;

        const { str, transform, width, height, fontName } = entry.item;
        const localStart = Math.max(start - entry.start, 0);
        const localEnd = Math.min(end - entry.start, str.length);
        const isFullItem = localStart <= 0 && localEnd >= str.length;

        let offsetPdf = 0;
        let widthPdf = width;

        if (!isFullItem) {
          const fontFamily =
            textContent.styles[fontName]?.fontFamily ?? "sans-serif";
          const measured = measureTokenOffset(
            str,
            { start: localStart, end: localEnd },
            fontFamily,
            transform,
            width,
          );
          if (!measured) continue;
          offsetPdf = measured.offset;
          widthPdf = measured.width;
        }

        segments.push({
          pageNumber,
          x: transform[4] + offsetPdf,
          baselineY: transform[5],
          width: widthPdf,
          height,
          fontSize: getItemFontSize(transform),
          fontName,
          fontFamily:
            textContent.styles[fontName]?.fontFamily ?? "sans-serif",
        });
      }

      if (segments.length > 0) {
        matches.push({ text: match[0], segments });
      }
    }
  }

  return matches;
}

export async function buildAnnotationHighlights(
  pdfDocument: PDFDocumentProxy,
  annotations: ReviewAnnotation[],
): Promise<PositionedAnnotation[]> {
  const highlights: PositionedAnnotation[] = [];
  const active = annotations.filter((annotation) => annotation.quote.trim());

  if (active.length === 0) {
    return highlights;
  }

  const matchers = active.map((annotation) => ({
    annotation,
    regex: buildQuoteMatcher(annotation.quote),
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

    for (const { annotation, regex } of matchers) {
      regex.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = regex.exec(pageText))) {
        const start = match.index;
        const end = start + match[0].length;

        // "word" granularity boxes every word separately; "phrase" (default)
        // draws one continuous box per underlying text run.
        const ranges =
          annotation.granularity === "word"
            ? wordRanges(pageText, start, end)
            : [{ start, end }];

        const rects = ranges
          .flatMap((range) =>
            entries
              .filter(
                (entry) => entry.start < range.end && entry.end > range.start,
              )
              .map((entry) =>
                buildEntryRect(
                  entry,
                  range.start - entry.start,
                  range.end - entry.start,
                  viewport,
                  pageNumber,
                  textContent.styles,
                ),
              ),
          )
          .filter((rect): rect is ScaledRect => rect !== null);

        if (rects.length === 0) continue;

        const style = annotationStyle(annotation);

        highlights.push({
          id: `${annotation.id}-${pageNumber}-${highlights.length}`,
          type: "text",
          annotation,
          color: style.color,
          borderColor: style.borderColor,
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
