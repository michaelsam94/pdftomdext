import * as vscode from "vscode";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import pdfParse from "pdf-parse";

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand(
    "pdftomdext.convertPdfToMarkdown",
    async (resource?: vscode.Uri) => {
      const sourceUri = await resolveSourceUri(resource);
      if (!sourceUri) {
        return;
      }

      const sourcePath = sourceUri.fsPath;
      const config = vscode.workspace.getConfiguration("pdftomdext");
      const configuredOutputFolder = config.get<string>("outputFolder", "");
      const overwriteExisting = config.get<boolean>("overwriteExisting", false);
      const openAfterConvert = config.get<boolean>("openAfterConvert", true);

      const sourceDir = path.dirname(sourcePath);
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      const outputDir = resolveOutputDir(
        configuredOutputFolder,
        sourceDir,
        workspaceRoot
      );
      const outputPath = path.join(
        outputDir,
        `${path.parse(sourcePath).name}.md`
      );

      try {
        await fs.mkdir(outputDir, { recursive: true });

        if (!overwriteExisting && (await fileExists(outputPath))) {
          vscode.window.showErrorMessage(
            `Output file already exists: ${outputPath}`
          );
          return;
        }

        const pdfBuffer = await fs.readFile(sourcePath);
        const extracted = await extractPdfText(pdfBuffer);
        const markdown = toMarkdown(extracted.text, sourcePath);
        await fs.writeFile(outputPath, markdown, "utf8");

        vscode.window.showInformationMessage(
          `Converted to Markdown: ${outputPath}`
        );

        if (openAfterConvert) {
          const doc = await vscode.workspace.openTextDocument(outputPath);
          await vscode.window.showTextDocument(doc, { preview: false });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`PDF conversion failed: ${message}`);
      }
    }
  );

  context.subscriptions.push(disposable);
}

async function resolveSourceUri(
  resource?: vscode.Uri
): Promise<vscode.Uri | undefined> {
  if (resource && resource.fsPath.toLowerCase().endsWith(".pdf")) {
    return resource;
  }

  const selection = await vscode.window.showOpenDialog({
    canSelectMany: false,
    openLabel: "Convert PDF to Markdown",
    filters: {
      "PDF Documents": ["pdf"]
    }
  });

  if (!selection || selection.length === 0) {
    return undefined;
  }

  return selection[0];
}

function resolveOutputDir(
  configuredOutputFolder: string,
  sourceDir: string,
  workspaceRoot?: string
): string {
  const trimmed = configuredOutputFolder.trim();
  if (!trimmed) {
    return sourceDir;
  }

  if (path.isAbsolute(trimmed)) {
    return trimmed;
  }

  if (workspaceRoot) {
    return path.join(workspaceRoot, trimmed);
  }

  return path.join(sourceDir, trimmed);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function extractPdfText(
  pdfBuffer: Buffer
): Promise<{ text: string; numpages: number }> {
  return pdfParse(pdfBuffer, {
    pagerender: renderPageWithLayout
  }) as Promise<{ text: string; numpages: number }>;
}

async function renderPageWithLayout(pageData: {
  getTextContent: (options: {
    normalizeWhitespace: boolean;
    disableCombineTextItems: boolean;
  }) => Promise<{ items: PdfTextItem[] }>;
}): Promise<string> {
  const textContent = await pageData.getTextContent({
    normalizeWhitespace: true,
    disableCombineTextItems: true
  });
  const lines = groupItemsIntoLines(textContent.items);

  const renderedLines = lines.map((line) => {
    const sorted = [...line].sort((a, b) => getItemX(a) - getItemX(b));
    let built = "";
    let previousEnd = -1;

    for (const item of sorted) {
      const value = item.str.trim();
      if (!value) {
        continue;
      }

      if (previousEnd >= 0) {
        const gap = getItemX(item) - previousEnd;
        if (gap > 14) {
          built += "\t";
        } else if (gap > 5) {
          built += " ";
        }
      }

      built += value;
      previousEnd = getItemX(item) + item.width;
    }

    return built.trim();
  });

  return renderedLines.filter(Boolean).join("\n");
}

function groupItemsIntoLines(items: PdfTextItem[]): PdfTextItem[][] {
  const sortedByY = [...items].sort((a, b) => {
    if (Math.abs(getItemY(a) - getItemY(b)) > 1.5) {
      return getItemY(b) - getItemY(a);
    }
    return getItemX(a) - getItemX(b);
  });

  const lines: { y: number; items: PdfTextItem[] }[] = [];
  for (const item of sortedByY) {
    const value = item.str.trim();
    if (!value) {
      continue;
    }

    const itemY = getItemY(item);
    const existing = lines.find((line) => Math.abs(line.y - itemY) <= 2);
    if (existing) {
      existing.items.push(item);
      continue;
    }

    lines.push({ y: itemY, items: [item] });
  }

  return lines.map((line) => line.items);
}

function toMarkdown(text: string, sourcePath: string): string {
  const title = path.parse(sourcePath).name;
  const normalized = normalizePdfText(text);
  const withTables = convertTableLikeBlocks(normalized);
  return `# ${title}\n\n${withTables}\n`;
}

function normalizePdfText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function convertTableLikeBlocks(text: string): string {
  const lines = text.split("\n");
  const output: string[] = [];

  let i = 0;
  while (i < lines.length) {
    const row = parseColumns(lines[i]);
    if (!row || row.length < 3) {
      output.push(lines[i]);
      i += 1;
      continue;
    }

    const tableRows: string[][] = [row];
    const expectedColumns = row.length;
    let j = i + 1;
    while (j < lines.length) {
      const next = parseColumns(lines[j]);
      if (next) {
        tableRows.push(normalizeRow(next, expectedColumns));
        j += 1;
        continue;
      }

      if (looksContinuationLine(lines[j]) && tableRows.length > 0) {
        mergeContinuationIntoRow(tableRows[tableRows.length - 1], lines[j]);
        j += 1;
        continue;
      }

      if (!next) {
        break;
      }
    }

    if (!isLikelyTable(tableRows)) {
      output.push(lines[i]);
      i += 1;
      continue;
    }

    output.push(...toMarkdownTable(tableRows));
    i = j;
  }

  return output.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function parseColumns(line: string): string[] | undefined {
  const trimmed = line.trim();
  if (!trimmed) {
    return undefined;
  }

  // Our layout renderer inserts tabs for large horizontal gaps.
  const columns = trimmed
    .split(/\t+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (columns.length < 3) {
    return undefined;
  }

  return columns;
}

function normalizeRow(row: string[], expectedColumns: number): string[] {
  if (row.length === expectedColumns) {
    return row;
  }

  if (row.length < expectedColumns) {
    return [...row, ...new Array(expectedColumns - row.length).fill("")];
  }

  const normalized = row.slice(0, expectedColumns - 1);
  normalized.push(row.slice(expectedColumns - 1).join(" "));
  return normalized;
}

function looksContinuationLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) {
    return false;
  }
  if (trimmed.startsWith("|")) {
    return false;
  }
  return trimmed.length > 0 && !/^[A-Z0-9][A-Z0-9-]*(\s*\t|$)/.test(trimmed);
}

function mergeContinuationIntoRow(row: string[], continuation: string): void {
  const targetIndex = findContinuationTargetIndex(row);
  const merged = `${row[targetIndex]} ${continuation.trim()}`.trim();
  row[targetIndex] = merged;
}

function findContinuationTargetIndex(row: string[]): number {
  // Avoid appending to ID-like first column when possible.
  let candidate = 1;
  let maxLength = row[candidate]?.length ?? 0;

  for (let i = 1; i < row.length; i += 1) {
    const len = row[i].length;
    if (len > maxLength) {
      maxLength = len;
      candidate = i;
    }
  }

  return candidate;
}

function isLikelyTable(rows: string[][]): boolean {
  if (rows.length < 2) {
    return false;
  }

  const colCount = rows[0].length;
  if (colCount < 3 || colCount > 8) {
    return false;
  }

  const populatedRows = rows.filter((row) => row.some((cell) => cell.trim()));
  if (populatedRows.length < 2) {
    return false;
  }

  const hasHeaderLikeRow = rows[0].some((cell) =>
    /id|role|story|ref|date|name|status/i.test(cell)
  );
  return hasHeaderLikeRow || rows.length >= 3;
}

function toMarkdownTable(rows: string[][]): string[] {
  const header = rows[0].map(escapeTableCell);
  const separator = header.map(() => "---");
  const body = rows.slice(1).map((row) => row.map(escapeTableCell));

  const rendered = [
    `| ${header.join(" | ")} |`,
    `| ${separator.join(" | ")} |`
  ];

  for (const row of body) {
    rendered.push(`| ${row.join(" | ")} |`);
  }

  return rendered;
}

function escapeTableCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

type PdfTextItem = {
  str: string;
  width: number;
  transform: [number, number, number, number, number, number];
};

function getItemX(item: PdfTextItem): number {
  return item.transform[4] ?? 0;
}

function getItemY(item: PdfTextItem): number {
  return item.transform[5] ?? 0;
}

export function deactivate() {}
