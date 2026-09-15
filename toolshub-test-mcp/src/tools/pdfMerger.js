// test_pdf_merger — uploads the two bundled PDFs, merges them, downloads the result and parses
// it with pdf-lib in Node so the page count is verified independently of what the page claims.
import fs from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { CONFIG, ROUTES, fixture } from '../config.js';
import { captureDownload, openTool, optionalText, uploadFiles, waitForPageState } from '../dom.js';
import { parseByteSizeText, parseMergeHeader, parsePageCount } from '../verify.js';

const FIXTURES = ['sample-a.pdf', 'sample-b.pdf'];

/** Ground truth: how many pages each fixture really has, counted in Node (not in the browser). */
async function groundTruthPageCounts() {
  const out = [];
  for (const name of FIXTURES) {
    const file = fixture(name);
    const bytes = fs.readFileSync(file);
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    out.push({ name, bytes: bytes.length, actualPageCount: doc.getPageCount() });
  }
  return out;
}

export const pdfMergerTool = {
  name: 'test_pdf_merger',
  title: 'Test PDF Merger',
  description:
    'End-to-end test of /tools/pdf-merger on the live ToolsHub site. Uploads the two bundled fixture PDFs (2 pages + 3 pages), waits for the page counts to be read, clicks "Merge PDFs", downloads "merged.pdf" and parses it with pdf-lib. Returns the page count of each input, the total page count of the merged result as reported by the page AND as measured from the downloaded file, and whether the download succeeded.',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },

  async run({ page, diagnostics }) {
    const truth = await groundTruthPageCounts();
    const expectedTotal = truth.reduce((sum, f) => sum + f.actualPageCount, 0);

    const route = await openTool(page, ROUTES.pdfMerger);
    const paths = truth.map((f) => fixture(f.name));
    await uploadFiles(page, paths);

    // Wait until the app has read both files (the Merge button enables once every row is "ready").
    await waitForPageState(
      page,
      () => {
        const button = [...document.querySelectorAll('button')].find((b) =>
          /Merge PDFs/i.test(b.textContent || '')
        );
        return Boolean(button) && !button.disabled;
      },
      null,
      { timeout: CONFIG.stepTimeoutMs, label: 'the "Merge PDFs" button to become enabled (both PDFs read)' }
    );

    // Per-file rows: "sample-a.pdf  2.1 KB · 2 pages"
    const rowTexts = await page.locator('ul > li').allInnerTexts().catch(() => []);
    const reportedInputs = truth.map((f) => {
      const rowText = (rowTexts.find((t) => t.includes(f.name)) || '').replace(/\s+/g, ' ').trim();
      return {
        ...f,
        rowText: rowText || null,
        reportedPageCount: parsePageCount(rowText),
        reportedSizeBytes: parseByteSizeText(rowText),
        pageCountMatches: parsePageCount(rowText) === f.actualPageCount,
      };
    });

    const headerText = await optionalText(page.locator('p', { hasText: /valid file/i }));
    const header = parseMergeHeader(headerText);
    const reportedTotalBeforeMerge = header.totalPages;

    // Merge.
    const mergeButton = page.locator('button', { hasText: /Merge PDFs/i }).first();
    await mergeButton.click();
    await waitForPageState(
      page,
      () => /Merged PDF ready/i.test(document.body?.innerText || ''),
      null,
      { timeout: CONFIG.stepTimeoutMs, label: 'the "Merged PDF ready" panel to appear' }
    );

    const resultText = await optionalText(page.locator('p', { hasText: /pages?\s*·/i }));
    const reportedMergedPages = parsePageCount(resultText);
    const reportedMergedSize = parseByteSizeText(resultText);

    // Download and parse the merged PDF for the authoritative page count.
    const link = page.locator('a[download="merged.pdf"], a:has-text("Download merged PDF")').first();
    const linkVisible = await link.isVisible().catch(() => false);
    let download = null;
    let mergedDocInfo = null;
    let downloadError = null;

    if (linkVisible) {
      try {
        download = await captureDownload(page, () => link.click(), {
          timeout: CONFIG.stepTimeoutMs,
          readBuffer: true,
        });
        if (download.buffer) {
          const doc = await PDFDocument.load(download.buffer, { ignoreEncryption: true });
          mergedDocInfo = {
            pageCount: doc.getPageCount(),
            title: doc.getTitle() ?? null,
            producer: doc.getProducer() ?? null,
            isPdf: download.buffer.subarray(0, 5).toString('latin1') === '%PDF-',
          };
        }
      } catch (err) {
        downloadError = String(err?.message || err).split('\n')[0];
      }
    }

    const measuredPages = mergedDocInfo?.pageCount ?? null;
    const downloadSucceeded = Boolean(download && !downloadError && measuredPages !== null);

    const warnings = [];
    for (const input of reportedInputs) {
      if (input.reportedPageCount !== input.actualPageCount) {
        warnings.push(
          `Page reported ${input.reportedPageCount} pages for ${input.name} but the file really has ${input.actualPageCount}.`
        );
      }
    }
    if (reportedTotalBeforeMerge !== expectedTotal) {
      warnings.push(
        `Header read "${headerText}" (parsed ${reportedTotalBeforeMerge} total pages); the two fixtures really contain ${expectedTotal}.`
      );
    }
    if (header.validFiles !== truth.length) {
      warnings.push(`Header counted ${header.validFiles} valid files, expected ${truth.length}.`);
    }
    if (measuredPages !== expectedTotal) {
      warnings.push(`Merged PDF contains ${measuredPages} pages, expected ${expectedTotal}.`);
    }
    if (reportedMergedPages !== null && reportedMergedPages !== measuredPages) {
      warnings.push(`Page reported ${reportedMergedPages} merged pages but the downloaded file has ${measuredPages}.`);
    }
    if (!linkVisible) warnings.push('No "Download merged PDF" link appeared after merging.');
    if (mergedDocInfo && !mergedDocInfo.isPdf) warnings.push('Downloaded file is not a PDF (bad magic bytes).');

    return {
      route: ROUTES.pdfMerger,
      httpStatus: route.status,
      inputPdfs: reportedInputs,
      expectedTotalPageCount: expectedTotal,
      headerTextBeforeMerge: headerText,
      reportedValidFileCount: header.validFiles,
      reportedTotalPageCountBeforeMerge: reportedTotalBeforeMerge,
      mergeResultText: resultText,
      reportedMergedPageCount: reportedMergedPages,
      reportedMergedSizeBytes: reportedMergedSize,
      mergedPdf: mergedDocInfo
        ? {
            ...mergedDocInfo,
            bytes: download.bytes,
            suggestedFilename: download.suggestedFilename,
          }
        : null,
      measuredMergedPageCount: measuredPages,
      totalPageCountOfMergedResult: measuredPages ?? reportedMergedPages,
      pageCountsCorrect: measuredPages === expectedTotal && reportedMergedPages === expectedTotal,
      downloadLinkAppeared: linkVisible,
      downloadSucceeded,
      ...(downloadError ? { downloadError } : {}),
      verdict: downloadSucceeded && measuredPages === expectedTotal && warnings.length === 0 ? 'pass' : 'fail',
      warnings,
      diagnostics: diagnostics.summary(),
    };
  },
};
