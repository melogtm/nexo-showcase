import { getDocument, VerbosityLevel } from "pdfjs-dist/legacy/build/pdf.mjs";
// Static import on purpose: it sets globalThis.pdfjsWorker, so pdfjs skips its dynamic import() of the worker,
// which Vercel's file tracing cannot see (the deployed function crashed with "Cannot find module pdf.worker.mjs").
import "pdfjs-dist/legacy/build/pdf.worker.mjs";

/** A text run on a line, in PDF points (x grows rightwards). */
export type Segment = { text: string; x: number; width: number };
/** One visual line of a page. `line` is 1-based, top to bottom, per page. */
export type Line = { page: number; line: number; segments: Segment[] };

const SAME_LINE_TOLERANCE = 2; // points; runs whose baselines differ less than this share a line

/** PDF bytes → visual lines, each with its segments sorted left to right. */
export async function extractLines(pdf: Uint8Array): Promise<Line[]> {
  // Errors-only verbosity: the missing standard-font-data warning is irrelevant for text. (pdfjs 6 no longer evals PDF code.)
  const task = getDocument({ data: pdf.slice(), verbosity: VerbosityLevel.ERRORS });
  const doc = await task.promise;
  try {
    const pages = Array.from({ length: doc.numPages }, (_, i) => i + 1);
    const contents = await Promise.all(pages.map(async (page) => (await doc.getPage(page)).getTextContent()));
    const lines: Line[] = [];
    contents.forEach((content, i) => {
      const page = i + 1;
      const runs: (Segment & { y: number })[] = [];
      for (const item of content.items) {
        if (!("str" in item) || !item.str.trim()) continue; // whitespace carries no content
        runs.push(...splitOnWideGaps({ text: item.str, x: item.transform[4], width: item.width, y: item.transform[5] }));
      }
      runs.sort((a, b) => b.y - a.y || a.x - b.x);
      const pageLines: (typeof runs)[] = [];
      for (const run of runs) {
        const current = pageLines.at(-1);
        if (current && Math.abs(current[0].y - run.y) < SAME_LINE_TOLERANCE) current.push(run);
        else pageLines.push([run]);
      }
      pageLines.forEach((runsOnLine, i) =>
        lines.push({
          page,
          line: i + 1,
          segments: runsOnLine.sort((a, b) => a.x - b.x).map(({ text, x, width }) => ({ text: text.trim(), x, width })),
        }),
      );
    });
    return lines;
  } finally {
    await task.destroy();
  }
}

/** Some PDFs put a whole table row in one text run; split it where there are 2+ spaces, interpolating x. */
function splitOnWideGaps(run: Segment & { y: number }): (Segment & { y: number })[] {
  const charWidth = run.width / run.text.length;
  const parts: (Segment & { y: number })[] = [];
  for (const match of run.text.matchAll(/\S+(?: \S+)*/g)) {
    parts.push({ text: match[0], x: run.x + match.index * charWidth, width: match[0].length * charWidth, y: run.y });
  }
  return parts;
}

export const lineText = (line: Line) => line.segments.map((s) => s.text).join(" ");
