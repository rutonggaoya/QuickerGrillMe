import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { orderQuestions } from "./order.js";
import type { AnswerRecord, AnswerSubmission, Question, Questionnaire } from "./types.js";

export interface DesignReviewOptions {
  generatedAt?: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderInline(value: string): string {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

function parseTableRow(line: string): string[] | undefined {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) {
    return undefined;
  }

  const content = trimmed.replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let cell = "";
  let inCode = false;
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    const nextCharacter = content[index + 1];
    if (character === "\\" && nextCharacter === "|") {
      cell += "|";
      index += 1;
      continue;
    }
    if (character === "`") {
      inCode = !inCode;
    }
    if (character === "|" && !inCode) {
      cells.push(cell.trim());
      cell = "";
      continue;
    }
    cell += character;
  }
  cells.push(cell.trim());
  return cells.length >= 2 ? cells : undefined;
}

function isTableSeparator(cells: string[]): boolean {
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function renderTable(header: string[], rows: string[][]): string {
  const width = header.length;
  const renderRow = (row: string[], element: "td" | "th"): string => {
    const normalized = Array.from({ length: width }, (_, index) => row[index] ?? "");
    return `<tr>${normalized
      .map((cell) => `<${element}>${renderInline(cell)}</${element}>`)
      .join("")}</tr>`;
  };
  return `<div class="table-wrap"><table><thead>${renderRow(
    header,
    "th"
  )}</thead><tbody>${rows.map((row) => renderRow(row, "td")).join("")}</tbody></table></div>`;
}

function renderMarkdown(markdown: string): string {
  const output: string[] = [];
  let paragraph: string[] = [];
  let listType: "ol" | "ul" | undefined;
  let listItems: string[] = [];
  let codeLines: string[] | undefined;

  const flushParagraph = (): void => {
    if (paragraph.length > 0) {
      output.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
      paragraph = [];
    }
  };
  const flushList = (): void => {
    if (listType !== undefined) {
      output.push(
        `<${listType}>${listItems
          .map((item) => `<li>${renderInline(item)}</li>`)
          .join("")}</${listType}>`
      );
      listType = undefined;
      listItems = [];
    }
  };
  const flushBlocks = (): void => {
    flushParagraph();
    flushList();
  };

  const lines = markdown.replaceAll("\r\n", "\n").split("\n");
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const rawLine = lines[lineIndex] ?? "";
    if (codeLines !== undefined) {
      if (rawLine.startsWith("```")) {
        output.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        codeLines = undefined;
      } else {
        codeLines.push(rawLine);
      }
      continue;
    }
    if (rawLine.startsWith("```")) {
      flushBlocks();
      codeLines = [];
      continue;
    }
    if (rawLine.trim() === "") {
      flushBlocks();
      continue;
    }

    const tableHeader = parseTableRow(rawLine);
    const tableSeparator = parseTableRow(lines[lineIndex + 1] ?? "");
    if (
      tableHeader !== undefined &&
      tableSeparator !== undefined &&
      tableSeparator.length === tableHeader.length &&
      isTableSeparator(tableSeparator)
    ) {
      flushBlocks();
      const rows: string[][] = [];
      lineIndex += 2;
      while (lineIndex < lines.length) {
        const row = parseTableRow(lines[lineIndex] ?? "");
        if (row === undefined) {
          lineIndex -= 1;
          break;
        }
        rows.push(row);
        lineIndex += 1;
      }
      output.push(renderTable(tableHeader, rows));
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(rawLine);
    if (heading !== null) {
      flushBlocks();
      const level = heading[1]?.length ?? 1;
      output.push(`<h${level}>${renderInline(heading[2] ?? "")}</h${level}>`);
      continue;
    }
    if (/^---+$/.test(rawLine.trim())) {
      flushBlocks();
      output.push("<hr>");
      continue;
    }
    const unordered = /^\s*[-*]\s+(.+)$/.exec(rawLine);
    const ordered = /^\s*\d+\.\s+(.+)$/.exec(rawLine);
    if (unordered !== null || ordered !== null) {
      flushParagraph();
      const nextType = unordered === null ? "ol" : "ul";
      if (listType !== undefined && listType !== nextType) {
        flushList();
      }
      listType = nextType;
      listItems.push((unordered ?? ordered)?.[1] ?? "");
      continue;
    }
    const quote = /^>\s?(.*)$/.exec(rawLine);
    if (quote !== null) {
      flushBlocks();
      output.push(`<blockquote>${renderInline(quote[1] ?? "")}</blockquote>`);
      continue;
    }
    flushList();
    paragraph.push(rawLine.trim());
  }

  if (codeLines !== undefined) {
    output.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
  }
  flushBlocks();
  return output.join("\n");
}

function optionLabels(question: Question, answer: AnswerRecord): string {
  const values = Array.isArray(answer.value) ? answer.value : [answer.value];
  return values
    .map((value) => question.options.find((option) => option.id === value)?.label ?? value)
    .join(", ");
}

function renderDecision(question: Question, answer: AnswerRecord): string {
  const status = answer.status === "deferred" ? "Deferred" : "Decided";
  const source = answer.source.replaceAll("-", " ");
  return `<article class="decision">
    <div class="decision-heading">
      <h3>${escapeHtml(question.prompt)}</h3>
      <span class="status ${escapeHtml(answer.status)}">${status}</span>
    </div>
    <p class="answer">${escapeHtml(optionLabels(question, answer))}</p>
    <dl>
      <div><dt>Source</dt><dd>${escapeHtml(source)}</dd></div>
      <div><dt>Confidence</dt><dd>${escapeHtml(answer.confidence)}</dd></div>
      <div><dt>Impact</dt><dd>${escapeHtml(question.impact)}</dd></div>
    </dl>
    <p class="affected"><strong>Affects:</strong> ${escapeHtml(
      question.affectedDecisions.join(", ")
    )}</p>
    ${
      answer.status === "deferred"
        ? `<p class="validation"><strong>Validate when:</strong> ${escapeHtml(
            answer.validationTrigger ?? question.defer.validationTrigger
          )}</p>`
        : ""
    }
  </article>`;
}

export function renderDesignReview(
  questionnaire: Questionnaire,
  submission: AnswerSubmission,
  designMarkdown: string,
  options: DesignReviewOptions = {}
): string {
  if (designMarkdown.trim() === "") {
    throw new Error("Final design Markdown must not be empty");
  }
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const decisions = orderQuestions(questionnaire.questions)
    .flatMap((question) => {
      const answer = submission.answers[question.id];
      return answer === undefined ? [] : [renderDecision(question, answer)];
    })
    .join("\n");
  const deferredCount = Object.values(submission.answers).filter(
    (answer) => answer.status === "deferred"
  ).length;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
    <title>${escapeHtml(questionnaire.metadata.title)} — Design review</title>
    <style>
      :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, sans-serif; color: #17202a; background: #f7f8fa; }
      * { box-sizing: border-box; }
      body { margin: 0; }
      main { width: min(1120px, calc(100% - 32px)); margin: 0 auto; padding: 32px 0 56px; }
      header, .design, .decisions { padding: 24px; border: 1px solid #d9dee7; border-radius: 14px; background: #fff; box-shadow: 0 3px 12px rgb(27 39 51 / 6%); }
      header { margin-bottom: 16px; }
      h1 { margin: 0 0 8px; font-size: clamp(1.7rem, 4vw, 2.6rem); }
      h2 { margin-top: 0; }
      h3 { margin: 0; font-size: 1rem; line-height: 1.35; }
      p, li { line-height: 1.55; }
      .subtitle { margin: 0; color: #5e6875; }
      .notice { margin: 18px 0 0; padding: 10px 12px; border-left: 3px solid #4b5fc0; background: #f0f3ff; color: #33408d; font-size: .88rem; }
      .facts { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
      .facts span, .status { padding: 4px 8px; border-radius: 999px; background: #eef1f5; font-size: .76rem; font-weight: 700; text-transform: capitalize; }
      .decisions { margin-bottom: 16px; }
      .design h1 { font-size: 1.8rem; }
      .design h2 { margin-top: 1.8rem; padding-bottom: 6px; border-bottom: 1px solid #e4e7ec; }
      .design h3 { margin-top: 1.3rem; font-size: 1.1rem; }
      .design code { padding: 2px 5px; border-radius: 5px; background: #f0f2f5; }
      .design pre { overflow: auto; padding: 14px; border-radius: 10px; background: #171a1f; color: #f6f7f9; }
      .design blockquote { margin: 16px 0; padding: 8px 14px; border-left: 3px solid #9ba5b4; color: #596473; }
      .table-wrap { overflow-x: auto; margin: 16px 0; }
      table { width: 100%; border-collapse: collapse; font-size: .9rem; }
      th, td { padding: 10px 12px; border: 1px solid #dfe3e8; text-align: left; vertical-align: top; }
      th { background: #f1f4f8; font-weight: 700; }
      tbody tr:nth-child(even) { background: #fafbfc; }
      .decision-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
      .decision { padding: 14px; border: 1px solid #e0e4ea; border-radius: 10px; background: #fbfcfd; }
      .decision-heading { display: flex; gap: 12px; align-items: start; justify-content: space-between; }
      .status.deferred { background: #fff0d8; color: #875b12; }
      .answer { margin: 10px 0; font-weight: 750; color: #263f8f; }
      dl { display: flex; flex-wrap: wrap; gap: 12px; margin: 0; color: #687384; font-size: .8rem; }
      dl div { display: flex; gap: 4px; }
      dt { font-weight: 700; }
      dd { margin: 0; text-transform: capitalize; }
      .affected, .validation { margin: 10px 0 0; color: #5e6875; font-size: .84rem; }
      .validation { padding: 8px 10px; border-radius: 7px; background: #fff7e9; color: #774d08; }
      footer { padding: 18px 4px 0; color: #6c7684; font-size: .8rem; text-align: center; }
      @media (max-width: 760px) { main { width: min(100% - 16px, 1120px); padding-top: 12px; } header, .design, .decisions { padding: 16px; } .decision-grid { grid-template-columns: 1fr; } }
    </style>
  </head>
  <body>
    <main>
      <header>
        <h1>${escapeHtml(questionnaire.metadata.title)}</h1>
        <p class="subtitle">${escapeHtml(questionnaire.metadata.description)}</p>
        <div class="facts">
          <span>Review requested</span>
          <span>${escapeHtml(submission.level)} depth</span>
          <span>Round ${submission.round}</span>
          <span>${Object.keys(submission.answers).length} decisions</span>
          <span>${deferredCount} deferred</span>
        </div>
        <p class="notice"><strong>Access intent:</strong> organization or invited reviewers only. This file does not enforce authentication; upload it only to a host with the required access controls.</p>
      </header>
      <section class="decisions">
        <h2>Key design decisions</h2>
        <div class="decision-grid">${decisions}</div>
      </section>
      <section class="design">
        ${renderMarkdown(designMarkdown)}
      </section>
      <footer>Generated by QuickerGrillMe at ${escapeHtml(generatedAt)}. Read-only review artifact; send feedback through your team's existing channel.</footer>
    </main>
  </body>
</html>
`;
}

export async function persistDesignReview(outputPath: string, html: string): Promise<void> {
  const normalizedPath = resolve(outputPath);
  await mkdir(dirname(normalizedPath), { recursive: true });
  const temporaryPath = `${normalizedPath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, html, "utf8");
    await rename(temporaryPath, normalizedPath);
  } catch (error) {
    try {
      await rm(temporaryPath, { force: true });
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        `Failed to persist design review and clean up ${temporaryPath}`
      );
    }
    throw error;
  }
}
