import { bodyLines, parseRawEmail } from "./email";
import { mergeExtractions, parseDocument, type Extraction } from "./parse";
import { extractPdfText, PdfFileError } from "./pdf-text";

// From an import's files to the one reading of them: each file read to lines
// and parsed, then the most complete leads and the rest fill in. Shared by the
// importer (files from storage) and the evals (files from disk), so both
// measure the same thing.

export const EMAIL = "message/rfc822";
const MAX_PDF_BYTES = 10 * 1024 * 1024;
/** Documents read per import (an email and its attachments). */
const MAX_SOURCES = 6;

/** Why a file couldn't be read. */
export type Problem = "PDF_UNREADABLE" | "NO_TEXT_LAYER" | "OCR_NOT_AVAILABLE" | "TOO_LARGE";

export interface SourceFile {
  name: string;
  mime: string;
  size: number;
  /** Fetched only when the file is read (a large PDF never is). */
  load: () => Promise<Uint8Array>;
}

export interface FilesReading {
  /** The best reading, or null when nothing was a receipt. */
  best: { extraction: Extraction; text: string } | null;
  problems: Set<Problem>;
  /** Every line read, file by file, to show what was seen. */
  seen: string[];
}

/** An email's Date header as a day in India (YYYY-MM-DD). */
export function indianDay(date: string | null): string | null {
  const t = date ? Date.parse(date) : NaN;
  return Number.isNaN(t) ? null : new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(t);
}

export async function extractFromFiles(files: SourceFile[]): Promise<FilesReading> {
  // An attached invoice is more complete than the email it came with, so PDFs go first.
  const rank = (mime: string) => (mime === "application/pdf" ? 0 : mime === EMAIL ? 1 : 2);
  const ordered = [...files].sort((a, b) => rank(a.mime) - rank(b.mime));

  const problems = new Set<Problem>();
  // Everything readable: an email is read together with its attachments.
  const read: { extraction: Extraction; lines: string[] }[] = [];
  const seen: string[] = [];

  for (const file of ordered.slice(0, MAX_SOURCES)) {
    let lines: string[];
    let sentOn: string | null = null;
    let sender: string | null = null;
    if (file.mime.startsWith("image/")) {
      problems.add("OCR_NOT_AVAILABLE");
      continue;
    } else if (file.mime === "application/pdf") {
      if (file.size > MAX_PDF_BYTES) {
        problems.add("TOO_LARGE");
        continue;
      }
      try {
        lines = (await extractPdfText(await file.load())).lines;
      } catch (e) {
        // Only a bad file is the user's to fix; anything else is our failure and can be retried.
        if (!(e instanceof PdfFileError)) throw e;
        problems.add("PDF_UNREADABLE");
        continue;
      }
    } else if (file.mime === EMAIL) {
      const email = await parseRawEmail(await file.load());
      lines = bodyLines(email);
      sentOn = indianDay(email.date);
      sender = email.fromHeader;
    } else {
      continue;
    }

    if (lines.length) seen.push(`── ${file.name} ──`, ...lines);
    const parsed = parseDocument(lines, { sentOn, sender });
    if (!parsed.ok) {
      if (parsed.reason === "no_text" && file.mime === "application/pdf") problems.add("NO_TEXT_LAYER");
      continue;
    }
    read.push({ extraction: parsed.extraction, lines });
  }

  // The most complete document leads (PDFs come first); the rest fill in what it lacks.
  const complete = (x: Extraction) =>
    x.lines.length > 0 || x.documentKind === "service_receipt" || x.documentKind === "refund_notice";
  const lead = read.find((r) => complete(r.extraction)) ?? read[0];
  if (!lead) return { best: null, problems, seen };
  return {
    best: {
      extraction: mergeExtractions(
        lead.extraction,
        read.filter((r) => r !== lead && r.extraction.documentKind !== "refund_notice").map((r) => r.extraction),
      ),
      text: read.map((r) => r.lines.join("\n")).join("\n"),
    },
    problems,
    seen,
  };
}
