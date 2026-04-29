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
        const extracted = await pdfParse(pdfBuffer);
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

function toMarkdown(text: string, sourcePath: string): string {
  const title = path.parse(sourcePath).name;
  const normalized = normalizePdfText(text);
  return `# ${title}\n\n${normalized}\n`;
}

function normalizePdfText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function deactivate() {}
