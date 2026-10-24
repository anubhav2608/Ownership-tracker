// Text extraction from digital PDFs with pdfjs-dist. Scanned PDFs have no text
// layer and come back (nearly) empty; those need OCR instead.

export interface PdfText {
  lines: string[];
  pageCount: number;
}

interface Run {
  str: string;
  x: number;
  y: number;
  width: number;
}

/** Rows closer than this (in PDF units) are treated as the same line. */
const SAME_LINE = 3;
/** A horizontal gap wider than this separates table columns. */
const COLUMN_GAP = 12;

/** The file itself can't be read (damaged, not a PDF, password-protected), as opposed to the reader failing. */
export class PdfFileError extends Error {}
const FILE_ERRORS = new Set(["InvalidPDFException", "PasswordException", "MissingPDFException", "FormatError"]);

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // Run pdfjs's worker code in this process. Otherwise pdfjs imports it by file
  // path at runtime, which some setups (bundlers, Windows paths) can't resolve.
  const global = globalThis as { pdfjsWorker?: unknown };
  global.pdfjsWorker ??= await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  return pdfjs;
}

export async function extractPdfText(data: Uint8Array): Promise<PdfText> {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ data, useSystemFonts: false, disableFontFace: true, verbosity: 0 });
  const doc = await task.promise.catch(async (e: Error) => {
    await task.destroy();
    throw FILE_ERRORS.has(e?.name) ? new PdfFileError(e.message) : e;
  });

  const lines: string[] = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const runs: Run[] = [];
      for (const item of content.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        runs.push({ str: item.str, x: item.transform[4], y: item.transform[5], width: item.width });
      }
      lines.push(...toLines(runs));
    }
  } finally {
    await task.destroy();
  }
  return { lines, pageCount: doc.numPages };
}

/** Groups text runs into reading-order lines; wide gaps become two spaces. */
function toLines(runs: Run[]): string[] {
  const rows: Run[][] = [];
  for (const run of [...runs].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const row = rows.find((r) => Math.abs(r[0].y - run.y) <= SAME_LINE);
    if (row) row.push(run);
    else rows.push([run]);
  }
  return rows.map((row) => {
    row.sort((a, b) => a.x - b.x);
    let line = "";
    let end = -Infinity;
    for (const run of row) {
      if (line) line += run.x - end > COLUMN_GAP ? "  " : run.x - end > 1 ? " " : "";
      line += run.str.trim();
      end = run.x + run.width;
    }
    return line.replace(/[ \t]{3,}/g, "  ").trim();
  });
}
