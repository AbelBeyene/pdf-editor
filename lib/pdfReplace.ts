/**
 * Replaces text in a PDF using the cover-and-redraw technique: each matched
 * segment is covered with a background-colored rectangle and the replacement
 * is drawn at the first segment's baseline. Text does not reflow, so
 * replacements much longer than the original may overlap what follows.
 *
 * Font fidelity is best-effort, in order:
 * 1. the PDF's own embedded font program, extracted via pdf.js and
 *    re-embedded with fontkit (fails for subset fonts missing the
 *    replacement's glyphs, or non-TTF/OTF font programs);
 * 2. a standard font matched to the original's family/weight/slant.
 */

import fontkit from "@pdf-lib/fontkit";
import {
  PDFDocument,
  PDFFont,
  StandardFonts,
  rgb,
} from "pdf-lib";
import type { PDFDocumentProxy } from "react-pdf-highlighter-extended/node_modules/pdfjs-dist";
import { findTextInPdf, type PdfTextSegment } from "@/lib/annotationEngine";

const COVER_COLOR = rgb(1, 1, 1);
const TEXT_COLOR = rgb(0.05, 0.09, 0.16);
/** Cover-box bleed beyond the measured glyph box, as fractions of the text
 * height. Generous on purpose: the reported metrics underestimate the real
 * ink extent (descenders, accents, antialiased edges), and any sliver left
 * uncovered shows as ghosting after a replace. */
const COVER_BELOW_RATIO = 0.35; // below the baseline (descenders)
const COVER_ABOVE_RATIO = 0.25; // above the ascent (accents, cap overshoot)
const COVER_SIDE_PAD = 1.5; // points on each side

export type ReplaceResult = {
  bytes: Uint8Array;
  replacedCount: number;
};

/** Picks the closest of the 14 standard PDF fonts from the original font's
 * name (e.g. "ABCDEF+Calibri-BoldItalic") and pdf.js's inferred family. */
function pickStandardFont(loadedName: string, fontFamily: string) {
  const bold = /bold|black|heavy|semi|demi/i.test(loadedName);
  const italic = /italic|oblique/i.test(loadedName);
  const mono =
    fontFamily === "monospace" || /mono|courier|consol/i.test(loadedName);
  const serif =
    fontFamily === "serif" ||
    /times|georgia|garamond|book|palatino|cambria/i.test(loadedName);

  if (mono) {
    if (bold && italic) return StandardFonts.CourierBoldOblique;
    if (bold) return StandardFonts.CourierBold;
    if (italic) return StandardFonts.CourierOblique;
    return StandardFonts.Courier;
  }
  if (serif) {
    if (bold && italic) return StandardFonts.TimesRomanBoldItalic;
    if (bold) return StandardFonts.TimesRomanBold;
    if (italic) return StandardFonts.TimesRomanItalic;
    return StandardFonts.TimesRoman;
  }
  if (bold && italic) return StandardFonts.HelveticaBoldOblique;
  if (bold) return StandardFonts.HelveticaBold;
  if (italic) return StandardFonts.HelveticaOblique;
  return StandardFonts.Helvetica;
}

type LoadedFontInfo = {
  /** Real font name from the PDF (for the standard-font heuristic). */
  name: string;
  /** Raw embedded font program bytes, when pdf.js exposes them. */
  data: Uint8Array | null;
};

/** Pulls the loaded font object for a text run out of pdf.js. Fonts are only
 * populated into commonObjs once the page's operator list has been built. */
async function getLoadedFontInfo(
  pdfDocument: PDFDocumentProxy,
  pageNumber: number,
  fontName: string,
): Promise<LoadedFontInfo> {
  try {
    const page = await pdfDocument.getPage(pageNumber);
    await page.getOperatorList();
    const commonObjs = page.commonObjs as {
      has: (id: string) => boolean;
      get: (id: string) => { name?: string; data?: Uint8Array } | null;
    };
    if (commonObjs.has(fontName)) {
      const fontObj = commonObjs.get(fontName);
      return {
        name: fontObj?.name ?? fontName,
        data: fontObj?.data ?? null,
      };
    }
  } catch {
    // fall through to the heuristic
  }
  return { name: fontName, data: null };
}

class FontResolver {
  private cache = new Map<string, PDFFont>();

  constructor(
    private pdfDoc: PDFDocument,
    private pdfDocument: PDFDocumentProxy,
  ) {}

  /** Resolves the fonts to try for a segment: the re-embedded original
   * first (when extractable), then the closest standard font. */
  async resolve(segment: PdfTextSegment): Promise<PDFFont[]> {
    const key = `${segment.pageNumber}:${segment.fontName}`;
    const cached = this.cache.get(key);
    const info = await getLoadedFontInfo(
      this.pdfDocument,
      segment.pageNumber,
      segment.fontName,
    );

    const fallback = await this.standard(
      pickStandardFont(info.name, segment.fontFamily),
    );

    if (cached) return [cached, fallback];

    if (info.data) {
      try {
        const embedded = await this.pdfDoc.embedFont(info.data.slice(), {
          customName: info.name,
        });
        this.cache.set(key, embedded);
        return [embedded, fallback];
      } catch {
        // subset/unsupported font program — use the standard font
      }
    }

    return [fallback];
  }

  private async standard(name: StandardFonts): Promise<PDFFont> {
    const cached = this.cache.get(name);
    if (cached) return cached;
    const font = await this.pdfDoc.embedFont(name);
    this.cache.set(name, font);
    return font;
  }
}

export async function replaceTextInPdf(
  originalBytes: ArrayBuffer,
  pdfDocument: PDFDocumentProxy,
  find: string,
  replace: string,
): Promise<ReplaceResult> {
  const matches = await findTextInPdf(pdfDocument, find);
  if (matches.length === 0) {
    return { bytes: new Uint8Array(originalBytes), replacedCount: 0 };
  }

  const pdfDoc = await PDFDocument.load(originalBytes);
  pdfDoc.registerFontkit(fontkit);
  const resolver = new FontResolver(pdfDoc, pdfDocument);
  const pages = pdfDoc.getPages();

  for (const match of matches) {
    for (const segment of match.segments) {
      const page = pages[segment.pageNumber - 1];
      if (!page) continue;

      const below = segment.height * COVER_BELOW_RATIO;
      const above = segment.height * COVER_ABOVE_RATIO;
      page.drawRectangle({
        x: segment.x - COVER_SIDE_PAD,
        y: segment.baselineY - below,
        width: segment.width + COVER_SIDE_PAD * 2,
        height: segment.height + below + above,
        color: COVER_COLOR,
      });
    }

    const first = match.segments[0];
    const page = pages[first.pageNumber - 1];
    if (page && replace) {
      const fonts = await resolver.resolve(first);
      for (const font of fonts) {
        try {
          page.drawText(replace, {
            x: first.x,
            y: first.baselineY,
            size: first.fontSize,
            font,
            color: TEXT_COLOR,
          });
          break;
        } catch {
          // missing glyphs in a subset font — try the next candidate
        }
      }
    }
  }

  const bytes = await pdfDoc.save();
  return { bytes, replacedCount: matches.length };
}
