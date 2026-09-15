// test_image_compressor — uploads the bundled JPEG, moves the quality slider, waits for the
// Canvas re-encode, then downloads the output and measures the REAL byte size on disk.
import { CONFIG, ROUTES, fixture } from '../config.js';
import {
  captureDownload,
  openTool,
  optionalEnabled,
  optionalText,
  setRangeValue,
  uploadFiles,
  waitForBusyThenIdle,
} from '../dom.js';
import { clampInt, parseByteSizeText } from '../verify.js';

const BUSY = ['Compressing…', 'Queued…'];
const SIZE_PAIR = /([\d.,]+\s*(?:B|KB|MB|GB|TB))\s*(?:→|->)\s*([\d.,]+\s*(?:B|KB|MB|GB|TB))/i;

export const imageCompressorTool = {
  name: 'test_image_compressor',
  title: 'Test Image Compressor',
  description:
    'End-to-end test of /tools/image-compressor on the live ToolsHub site. Uploads the bundled fixture JPEG (fixtures/test-image.jpg), sets the quality slider (default 50%), waits for the in-browser Canvas compression to finish, then clicks Download and measures the real output file size. Returns the original size, the compressed size, whether the size decreased, and whether the download button appeared and worked.',
  inputSchema: {
    type: 'object',
    properties: {
      quality: {
        type: 'integer',
        minimum: 10,
        maximum: 100,
        description: 'Quality slider value to set. The slider runs 10-100 in steps of 5. Default 50.',
      },
      outputFormat: {
        type: 'string',
        enum: ['auto', 'image/jpeg', 'image/webp', 'image/png'],
        description:
          'Optional output format to select ("auto" keeps the input format). PNG is lossless, so quality has no effect on it. Default: leave the page on "Same as input".',
      },
    },
    additionalProperties: false,
  },

  async run({ page, diagnostics }, args = {}) {
    const quality = clampInt(args.quality ?? 50, 10, 100, 50);
    const route = await openTool(page, ROUTES.imageCompressor);

    // 1. Upload the fixture.
    const [uploaded] = await uploadFiles(page, fixture('test-image.jpg'));
    const row = page.locator('li', { hasText: uploaded.name }).first();
    await row.waitFor({ state: 'visible', timeout: CONFIG.stepTimeoutMs });

    // 2. First compression pass runs automatically at the page's default quality (70%).
    await waitForBusyThenIdle(page, BUSY, { timeout: CONFIG.stepTimeoutMs });
    const downloadButton = row.locator('button', { hasText: 'Download' }).first();
    const downloadButtonAppeared = await downloadButton
      .waitFor({ state: 'visible', timeout: CONFIG.stepTimeoutMs })
      .then(() => true)
      .catch(() => false);
    const defaultQualityText = (await optionalText(row)) || '';
    const defaultQuality = parseByteSizeText(SIZE_PAIR.exec(defaultQualityText)?.[2] ?? '');

    // 3. Apply the requested settings.
    let outputFormat = null;
    if (args.outputFormat && args.outputFormat !== 'auto') {
      await page.selectOption('#ic-format', args.outputFormat);
      outputFormat = args.outputFormat;
    } else if (args.outputFormat === 'auto') {
      await page.selectOption('#ic-format', 'auto');
      outputFormat = 'auto';
    }
    const qualityValueAfterSet = await setRangeValue(page, '#ic-quality', quality);
    await waitForBusyThenIdle(page, BUSY, { timeout: CONFIG.stepTimeoutMs });

    // The quality badge next to the slider must agree with what we set.
    const qualityLabel = await optionalText(page.locator('label[for="ic-quality"] + span, span.tabular-nums'));

    // 4. Read what the page reports for this file.
    const rowText = (await optionalText(row)) || '';
    const sizes = SIZE_PAIR.exec(rowText);
    const dimensions = /(\d+)\s*×\s*(\d+)/.exec(rowText);
    const smallerBy = /[↓\-−]\s*(\d+)\s*%\s*smaller/i.exec(rowText);
    const summaryLine = await optionalText(page.locator('p', { hasText: /image/ }));

    // 5. Download the compressed output and measure the real bytes.
    let download = null;
    if (downloadButtonAppeared) {
      try {
        download = await captureDownload(page, () => downloadButton.click(), {
          timeout: CONFIG.stepTimeoutMs,
          readBuffer: true,
        });
      } catch (err) {
        download = { error: String(err?.message || err).split('\n')[0] };
      }
    }

    const compressedBytes = download?.bytes ?? null;
    const buffer = download?.buffer;
    const magic = buffer ? buffer.subarray(0, 3).toString('hex') : null;

    // 6. Is the batch ZIP button usable too?
    const zipDownloadAvailable = await optionalEnabled(page.locator('button', { hasText: 'Download all' }));

    const sizeDecreased = compressedBytes !== null ? compressedBytes < uploaded.bytes : null;
    const savingsPercent =
      compressedBytes !== null && uploaded.bytes > 0
        ? Number((((uploaded.bytes - compressedBytes) / uploaded.bytes) * 100).toFixed(1))
        : null;

    // A JPEG re-encoded at q50 must be smaller than a q92 original — if not, say so loudly.
    const warnings = [];
    if (compressedBytes !== null && !sizeDecreased) {
      warnings.push(
        `Compressed output (${compressedBytes} B) is not smaller than the original (${uploaded.bytes} B). Expected a large saving at quality ${quality}%.`
      );
    }
    if (download?.suggestedFilename && !/-compressed\./.test(download.suggestedFilename)) {
      warnings.push(`Unexpected download filename: ${download.suggestedFilename}`);
    }
    if (magic && magic !== 'ffd8ff' && outputFormat !== 'image/webp' && outputFormat !== 'image/png') {
      warnings.push(`Downloaded file does not start with a JPEG magic number (got 0x${magic}).`);
    }
    if (!downloadButtonAppeared) warnings.push('No per-image Download button appeared after compression.');
    if (page.url().includes('/tools/image-compressor') === false) {
      warnings.push(`Page navigated away unexpectedly: ${page.url()}`);
    }

    return {
      route: ROUTES.imageCompressor,
      httpStatus: route.status,
      fixture: { name: uploaded.name, originalSizeBytes: uploaded.bytes },
      requested: { quality, qualitySliderValue: qualityValueAfterSet, outputFormat },
      qualityLabelShown: qualityLabel,
      originalSizeBytes: uploaded.bytes,
      compressedSizeBytes: compressedBytes,
      sizeDecreased,
      savingsPercent,
      reportedByPage: {
        rowText,
        originalSizeText: sizes?.[1] ?? null,
        compressedSizeText: sizes?.[2] ?? null,
        compressedSizeTextBytes: parseByteSizeText(sizes?.[2]),
        dimensions: dimensions ? `${dimensions[1]}×${dimensions[2]}` : null,
        smallerByPercent: smallerBy ? Number(smallerBy[1]) : null,
        summaryLine,
        defaultQualityCompressedBytes: defaultQuality,
      },
      downloadButtonAppeared,
      downloadWorked: Boolean(download && !download.error && compressedBytes !== null),
      download: download
        ? {
            suggestedFilename: download.suggestedFilename ?? null,
            bytes: download.bytes ?? null,
            jpegMagicOk: magic === 'ffd8ff',
            ...(download.error ? { error: download.error } : {}),
          }
        : null,
      zipDownloadButtonAvailable: zipDownloadAvailable,
      verdict:
        download && !download.error && sizeDecreased && downloadButtonAppeared
          ? 'pass'
          : download && !download.error && downloadButtonAppeared
            ? 'pass-with-warning (downloaded, but the file did not shrink)'
            : 'fail',
      warnings,
      diagnostics: diagnostics.summary(),
    };
  },
};
