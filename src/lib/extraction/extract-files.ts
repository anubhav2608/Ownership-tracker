import { aiExtraction, canReadWithAi, crossCheck, type AiReader } from "./ai-read";
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
export type Problem = "PDF_UNREADABLE" | "NO_TEXT_LAYER" | "OCR_NOT_AVAILABLE" | "AI_UNREADABLE" | "AI_FAILED" | "TOO_LARGE";

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

/**
 * Asks Claude, if it can read the file. Never throws: "skipped" when there's no
 * AI or it can't take the file, "unreadable" when it couldn't make it out,
 * "failed" when the call itself failed (worth retrying).
 */
async function askAi(ai: AiReader | undefined, file: SourceFile, bytes: Uint8Array) {
  if (!ai || !canReadWithAi(file.mime, bytes.byteLength)) return "skipped" as const;
  try {
    const doc = await ai({ name: file.name, mime: file.mime, bytes });
    return doc ? { extraction: aiExtraction(doc) } : ("unreadable" as const);
  } catch (e) {
    console.error(`[extract] AI reading of ${file.name} failed:`, e instanceof Error ? e.message : e);
    return "failed" as const;
  }
}

const AI_PROBLEM = { skipped: "OCR_NOT_AVAILABLE", unreadable: "AI_UNREADABLE", failed: "AI_FAILED" } as const;

/**
 * Reads the files. With `ai`, photos and scanned PDFs are read by Claude, and
 * text PDFs are read by both Claude and the template reader and cross-checked.
 */
export async function extractFromFiles(files: SourceFile[], options: { ai?: AiReader } = {}): Promise<FilesReading> {
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
      const bytes = await file.load();
      const byAi = await askAi(options.ai, file, bytes);
      if (typeof byAi === "string") {
        problems.add(AI_PROBLEM[byAi]);
        continue;
      }
      seen.push(`── ${file.name} (read by AI) ──`);
      if (byAi.extraction) read.push({ extraction: byAi.extraction, lines: [] });
      continue;
    } else if (file.mime === "application/pdf") {
      if (file.size > MAX_PDF_BYTES) {
        problems.add("TOO_LARGE");
        continue;
      }
      const bytes = await file.load();
      try {
        // A copy: the PDF reader takes over (empties) the buffer it's given, and the AI needs it too.
        lines = (await extractPdfText(bytes.slice())).lines;
      } catch (e) {
        // Only a bad file is the user's to fix; anything else is our failure and can be retried.
        if (!(e instanceof PdfFileError)) throw e;
        problems.add("PDF_UNREADABLE");
        continue;
      }
      const ai = await askAi(options.ai, file, bytes);
      // A scan the AI couldn't read either; a text PDF falls back to the template reader below.
      if (typeof ai === "string" && ai !== "skipped" && !lines.length) {
        problems.add(AI_PROBLEM[ai]);
        continue;
      }
      if (typeof ai !== "string") {
        if (lines.length) seen.push(`── ${file.name} ──`, ...lines);
        else seen.push(`── ${file.name} (read by AI) ──`);
        if (ai.extraction) {
          const rules = parseDocument(lines, {});
          read.push({ extraction: crossCheck(ai.extraction, rules.ok ? rules.extraction : null), lines });
        }
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
