// test_qr_generator — types text into the QR tool, waits for the <img> to render, measures it,
// and clicks "Download PNG" to prove the export really produces a valid PNG file.
import { CONFIG, ROUTES } from '../config.js';
import {
  captureDownload,
  dataUrlToBuffer,
  openTool,
  optionalEnabled,
  optionalText,
  pngDimensions,
  waitForPageState,
} from '../dom.js';

const QR_IMAGE = 'img[alt="Generated QR code"]';

/**
 * Wait for the QR code to render OR for the page's own "too long" error — whichever comes first.
 * Racing both outcomes keeps the failure path at ~300 ms instead of burning the whole timeout
 * waiting for an image that will never exist.
 */
function waitForQrOutcome(page, { timeout = CONFIG.stepTimeoutMs } = {}) {
  return waitForPageState(
    page,
    () => {
      const img = document.querySelector('img[alt="Generated QR code"]');
      if (img && img.complete && img.naturalWidth > 0) return true;
      const alert = document.querySelector('[role="alert"]');
      if (alert && (alert.textContent || '').trim().length > 0) return true;
      return /too long to fit in a single QR code/i.test(document.body?.innerText || '');
    },
    null,
    { timeout, label: 'the QR image to render (or the page to report an encoding error)' }
  );
}

export const qrGeneratorTool = {
  name: 'test_qr_generator',
  title: 'Test QR Code Generator',
  description:
    'End-to-end test of /tools/qr-code-generator on the live ToolsHub site. Types the given text into the input, waits for the QR code image to render, reports its rendered and intrinsic pixel size, then clicks "Download PNG" and validates the downloaded file is a real PNG of the expected size.',
  inputSchema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'Text or URL to encode. Default "https://example.com".',
      },
      size: {
        type: 'string',
        enum: ['sm', 'md', 'lg'],
        description:
          'Optional download size preset to click: sm = 256px, md = 512px, lg = 1024px. Default: leave the page on md (512px).',
      },
    },
    additionalProperties: false,
  },

  async run({ page, diagnostics }, args = {}) {
    const text = typeof args.text === 'string' && args.text.length > 0 ? args.text : 'https://example.com';
    const route = await openTool(page, ROUTES.qrGenerator);

    await page.fill('#qr-text', text);

    // The page debounces generation by 250 ms after each keystroke.
    const qrImage = page.locator(QR_IMAGE).first();
    await waitForQrOutcome(page).catch(() => {});
    const appeared = (await qrImage.count()) > 0 && (await qrImage.isVisible().catch(() => false));

    if (!appeared) {
      const errorText = await optionalText(page.locator('[role="alert"]'));
      const emptyState = await optionalText(
        page.locator('p', { hasText: /QR code will appear here|too long to fit/i })
      );
      return {
        route: ROUTES.qrGenerator,
        httpStatus: route.status,
        text,
        qrImageAppeared: false,
        errorShownOnPage: errorText || emptyState,
        verdict: 'fail',
        warnings: ['No QR <img> rendered within the timeout.'],
        diagnostics: diagnostics.summary(),
      };
    }

    if (args.size) {
      const sizeLabels = { sm: 'Small', md: 'Medium', lg: 'Large' };
      const button = page
        .locator('[role="group"][aria-label="QR code size"] button', { hasText: sizeLabels[args.size] })
        .first();
      await button.click();
      // Regenerating at a new width re-runs the debounced effect.
      await waitForQrOutcome(page).catch(() => {});
    }

    const measured = await qrImage.evaluate((el) => ({
      naturalWidth: el.naturalWidth,
      naturalHeight: el.naturalHeight,
      srcPrefix: String(el.currentSrc || el.src || '').slice(0, 32),
      complete: el.complete,
    }));
    const box = await qrImage.boundingBox();
    const captionText = await optionalText(page.locator('p', { hasText: /exports at/i }));
    const exportPx = /exports at (\d+)\s*×\s*(\d+)px/.exec(captionText || '');
    const characterCountLine = await optionalText(page.locator('p', { hasText: /character/i }));

    // Download PNG.
    const downloadButton = page.locator('button', { hasText: /Download PNG/i }).first();
    const downloadButtonVisible = (await downloadButton.count()) > 0;
    const downloadButtonEnabled = await optionalEnabled(downloadButton);

    let download = null;
    let downloadError = null;
    let dataUrlInfo = null;
    if (downloadButtonEnabled) {
      try {
        download = await captureDownload(page, () => downloadButton.click(), {
          timeout: CONFIG.stepTimeoutMs,
          readBuffer: true,
        });
      } catch (err) {
        downloadError = String(err?.message || err).split('\n')[0];
      }
    }

    // Independent check: decode the QR data URL the page already rendered.
    const src = await qrImage.getAttribute('src').catch(() => null);
    if (src) {
      const decoded = dataUrlToBuffer(src);
      if (decoded) {
        dataUrlInfo = {
          mimeType: decoded.mimeType,
          bytes: decoded.buffer.length,
          pngSignature: decoded.buffer.subarray(0, 8).toString('hex') === '89504e470d0a1a0a',
          dimensions: pngDimensions(decoded.buffer),
        };
      }
    }

    const downloadedPng = download?.buffer ? pngDimensions(download.buffer) : null;
    const downloadWorked = Boolean(download && !downloadError && download.bytes > 0);

    const warnings = [];
    if (measured.naturalWidth === 0) warnings.push('The QR <img> has no intrinsic width — it may be a broken image.');
    if (!src?.startsWith('data:image/png')) warnings.push('The QR preview src is not an inline PNG data URL.');
    if (dataUrlInfo && !dataUrlInfo.pngSignature) warnings.push('Rendered QR data URL is not a valid PNG.');
    if (!downloadButtonEnabled) warnings.push('The "Download PNG" button stayed disabled.');
    if (!downloadWorked && !downloadError) warnings.push('Clicking "Download PNG" did not produce a file.');
    if (exportPx && dataUrlInfo?.dimensions && dataUrlInfo.dimensions.width !== Number(exportPx[1])) {
      warnings.push(
        `Page says it exports at ${exportPx[1]}px but the preview is ${dataUrlInfo.dimensions.width}px (the preview is intentionally downscaled — the download is what matters).`
      );
    }
    if (downloadedPng && exportPx && downloadedPng.width !== Number(exportPx[1])) {
      warnings.push(`Downloaded PNG is ${downloadedPng.width}px wide but the page promised ${exportPx[1]}px.`);
    }
    if (characterCountLine && !characterCountLine.includes(String(text.length))) {
      warnings.push(`Character counter reads "${characterCountLine}" for a ${text.length}-character input.`);
    }

    return {
      route: ROUTES.qrGenerator,
      httpStatus: route.status,
      text,
      textLength: text.length,
      qrImageAppeared: true,
      renderedSize: box ? { width: Math.round(box.width), height: Math.round(box.height) } : null,
      intrinsicSize: { width: measured.naturalWidth, height: measured.naturalHeight },
      exportSizeClaimedByPage: exportPx ? `${exportPx[1]}×${exportPx[2]}px` : null,
      characterCounterShown: characterCountLine,
      downloadButtonAppeared: downloadButtonVisible,
      downloadButtonEnabled,
      downloadWorked,
      download: download
        ? {
            suggestedFilename: download.suggestedFilename,
            bytes: download.bytes,
            pngSignature: download.buffer.subarray(0, 8).toString('hex') === '89504e470d0a1a0a',
            dimensions: downloadedPng,
          }
        : null,
      ...(downloadError ? { downloadError } : {}),
      renderedPreview: dataUrlInfo,
      verdict: appeared && downloadWorked && warnings.length === 0 ? 'pass' : downloadWorked ? 'pass-with-warning' : 'fail',
      warnings,
      diagnostics: diagnostics.summary(),
    };
  },
};
