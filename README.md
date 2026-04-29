# PdfToMd

Convert PDF files to Markdown inside VS Code.

![PdfToMd banner](pdftomdext-banner.png)

## Features

- Command: `PDF to Markdown: Convert File`
- Right-click `.pdf` in Explorer and convert directly from the context menu
- Select a `.pdf` file and generate a `.md` file
- Optional auto-open of the generated Markdown file
- Configurable output folder and overwrite behavior

## Extension Settings

- `pdftomdext.outputFolder`: Target folder for generated Markdown files.
  - Empty: save next to source `.pdf`
  - Relative: resolved from the first workspace folder
  - Absolute: used directly
- `pdftomdext.overwriteExisting`: Overwrite existing `.md` file if present.
- `pdftomdext.openAfterConvert`: Open generated Markdown file after conversion.

## Scripts

- `npm run compile`: Compile TypeScript
- `npm run watch`: Watch and compile on changes
- `npm run lint`: Run ESLint
- `npm test`: Run extension tests

## Run locally

1. Install dependencies: `npm install`
2. Press `F5` in VS Code to launch Extension Development Host
3. Convert using either:
   - Explorer right-click on a `.pdf` file -> `PDF to Markdown: Convert File`
   - Command Palette -> `PDF to Markdown: Convert File`

## Publish

1. Install VSCE globally: `npm i -g @vscode/vsce`
2. Login once: `vsce login michaelsam94`
3. Publish: `vsce publish`
