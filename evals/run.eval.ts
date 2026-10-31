import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseRawEmail } from "@/lib/extraction/email";
import { EMAIL, extractFromFiles, type SourceFile } from "@/lib/extraction/extract-files";
import { pickRefundedItems } from "@/lib/extraction/match";
import { parseDocument } from "@/lib/extraction/parse";
import { kindOf, scoreCase, summarize, type CaseScore, type Expected, type Reading, type Summary } from "@/lib/evals/score";

// Runs every case in evals/cases (fictional, in the repo) and evals/private
// (your real emails, never committed) through the same reader as the app's
// imports, scores it against its .expected.json, and writes evals/out/report.md.
// EVAL_SET=cases or EVAL_SET=private runs just one folder.

const ROOT = join(process.cwd(), "evals");
const SETS = ["cases", "private"].filter((s) => !process.env.EVAL_SET || process.env.EVAL_SET === s);
const thresholds = JSON.parse(readFileSync(join(ROOT, "thresholds.json"), "utf8")) as Record<string, number>;

const MIME: Record<string, string> = { ".eml": EMAIL, ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg" };

function cases() {
  return SETS.flatMap((set) => {
    const dir = join(ROOT, set);
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => f.endsWith(".expected.json"))
      .map((f) => {
        const base = f.replace(/\.expected\.json$/, "");
        const input = readdirSync(dir).find((g) => g.startsWith(`${base}.`) && !g.endsWith(".expected.json"));
        return { set, name: `${set}/${base}`, input: input && join(dir, input), expected: JSON.parse(readFileSync(join(dir, f), "utf8")) as Expected };
      });
  });
}

async function read(path: string, expected: Expected): Promise<Reading> {
  let reading: Reading;
  let text = "";
  if (path.endsWith(".txt")) {
    const lines = readFileSync(path, "utf8").split("\n");
    const parsed = parseDocument(lines, { sentOn: expected.input?.sentOn ?? null, sender: expected.input?.sender ?? null });
    reading = { kind: kindOf(parsed.ok ? parsed.extraction : null), extraction: parsed.ok ? parsed.extraction : null };
    text = lines.join("\n");
  } else {
    const bytes = new Uint8Array(readFileSync(path));
    const ext = path.slice(path.lastIndexOf("."));
    const files: SourceFile[] = [{ name: path, mime: MIME[ext] ?? "application/octet-stream", size: bytes.byteLength, load: async () => bytes }];
    // An email is read with its attached PDFs and photos, as the app stores them.
    if (ext === ".eml") {
      for (const a of (await parseRawEmail(bytes)).attachments) {
        if (a.mimeType === "application/pdf" || a.mimeType.startsWith("image/")) {
          files.push({ name: a.fileName, mime: a.mimeType, size: a.content.byteLength, load: async () => a.content });
        }
      }
    }
    const { best } = await extractFromFiles(files);
    reading = { kind: kindOf(best?.extraction ?? null), extraction: best?.extraction ?? null };
    text = best?.text ?? "";
  }
  // A return or cancellation: which of the given purchase's items it would tick.
  const x = reading.extraction;
  if (expected.purchase && x?.documentKind === "refund_notice") {
    reading.ticked = pickRefundedItems({
      names: x.lines.flatMap((l) => (l.name.value ? [l.name.value] : [])),
      text,
      items: expected.purchase.items,
      amount: x.fields.total?.value ?? null,
      cancelled: x.fields.outcome?.value === "cancelled",
    }).itemIds;
  }
  return reading;
}

const pct = (r: number | null | undefined) => (r === null || r === undefined ? "–" : `${Math.round(r * 1000) / 10}%`);
const show = (v: unknown) => (v === null || v === undefined ? "—" : typeof v === "string" ? v : JSON.stringify(v));

function report(all: CaseScore[], total: Summary) {
  const shops = [...new Set(all.map((s) => s.shop))].sort();
  const row = (label: string, s: Summary) =>
    `| ${label} | ${s.cases} | ${pct(s.accuracy.kind)} | ${pct(s.accuracy.orderRef)} | ${pct(s.accuracy.date)} | ${pct(s.accuracy.total)} | ${pct(s.itemRecall)} | ${pct(s.itemPrecision)} | ${pct(s.accuracy.itemPrice)} | ${pct(s.tickPrecision)} |`;
  const lines = [
    "# Reader evals",
    "",
    `${total.cases} cases from ${SETS.join(" + ")}. Hard-rule breaks: **${total.violations.length}**.`,
    "",
    "| Shop | Cases | Kind | Order ID | Date | Total | Items found | No junk items | Item price | Right ticks |",
    "|---|---|---|---|---|---|---|---|---|---|",
    row("**All**", total),
    ...shops.map((shop) => row(shop, summarize(all.filter((s) => s.shop === shop)))),
    "",
    `Of the values read wrong, ${pct(total.flaggedShare)} were highlighted as hard to read.`,
    "",
  ];
  if (total.violations.length) {
    lines.push("## Hard-rule breaks", "", ...total.violations.map((v) => `- **${v.name}**: ${v.rule}`), "");
  }
  const missed = all.filter((s) => s.misses.length);
  if (missed.length) {
    lines.push("## Misses", "", "| Case | What | Expected | Got | Highlighted |", "|---|---|---|---|---|");
    for (const s of missed) {
      for (const m of s.misses) {
        lines.push(`| ${s.name} | ${m.field} | ${show(m.expected)} | ${show(m.got)} | ${m.flagged === undefined ? "" : m.flagged ? "yes" : "no"} |`);
      }
    }
  }
  return lines.join("\n") + "\n";
}

describe("reader evals", async () => {
  const all: CaseScore[] = [];
  for (const c of cases()) {
    if (!c.input) throw new Error(`${c.name}: no input file next to its .expected.json`);
    all.push(scoreCase(c.name, c.expected, await read(c.input, c.expected)));
  }
  const total = summarize(all);
  mkdirSync(join(ROOT, "out"), { recursive: true });
  writeFileSync(join(ROOT, "out", "report.md"), report(all, total));
  console.log(`\n${report(all, total).split("\n## Misses")[0]}\nFull report: evals/out/report.md\n`);

  it("has cases", () => expect(all.length).toBeGreaterThan(0));

  it("never breaks a hard rule", () => expect(total.violations).toEqual([]));

  // Each metric at or above its threshold (evals/thresholds.json).
  const metrics: Record<string, number | null | undefined> = {
    kind: total.accuracy.kind,
    orderRef: total.accuracy.orderRef,
    date: total.accuracy.date,
    total: total.accuracy.total,
    itemPrice: total.accuracy.itemPrice,
    itemRecall: total.itemRecall,
    itemPrecision: total.itemPrecision,
    tickPrecision: total.tickPrecision,
  };
  it.each(Object.keys(thresholds))("%s meets its threshold", (metric) => {
    const value = metrics[metric];
    if (value === null || value === undefined) return; // nothing of that kind in these cases
    expect(value, `${metric}: ${pct(value)} < ${pct(thresholds[metric])}`).toBeGreaterThanOrEqual(thresholds[metric]);
  });
});
