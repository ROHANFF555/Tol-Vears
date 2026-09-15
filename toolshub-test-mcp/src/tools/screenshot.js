// get_screenshot — renders any route in a real browser and returns a PNG so Claude can look at
// the actual layout instead of guessing from the markup.
import { CONFIG, urlFor } from '../config.js';
import { gotoRoute, inspectPageHealth, pngDimensions } from '../dom.js';

// Base64 inflates a PNG by ~33%; keep the payload well under typical MCP message limits.
const MAX_PNG_BYTES = 3.5 * 1024 * 1024;

export const screenshotTool = {
  name: 'get_screenshot',
  title: 'Screenshot Any Route',
  description:
    'Opens any ToolsHub route in a real headless Chromium at 1280×900 and returns a full-page PNG screenshot (base64) so the layout, spacing, colours and dark/light styling can be inspected visually. Also reports the HTTP status, page title and any console errors for that route.',
  inputSchema: {
    type: 'object',
    properties: {
      route: {
        type: 'string',
        description: 'Route path to capture, e.g. "/tools/qr-code-generator" or "/".',
      },
      fullPage: {
        type: 'boolean',
        description: 'Capture the whole scrollable page (default true). Set false for just the visible viewport.',
      },
      darkMode: {
        type: 'boolean',
        description: 'Force dark mode by adding the "dark" class to <html> before capturing. Default: leave the site as-is.',
      },
    },
    required: ['route'],
    additionalProperties: false,
  },

  async run({ page, diagnostics }, args = {}) {
    const route = String(args.route ?? '/').trim() || '/';
    const path = route.startsWith('/') ? route : `/${route}`;
    const fullPage = args.fullPage !== false;

    const { status } = await gotoRoute(page, urlFor(path), { timeout: CONFIG.navTimeoutMs });
    const health = await inspectPageHealth(page);

    if (args.darkMode === true) {
      await page.evaluate(() => document.documentElement.classList.add('dark'));
    } else if (args.darkMode === false) {
      await page.evaluate(() => document.documentElement.classList.remove('dark'));
    }

    // Let webfonts/images settle so the screenshot matches what a user sees.
    await page.evaluate(() => document.fonts?.ready).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});

    let buffer = await page.screenshot({ fullPage, type: 'png', caret: 'initial' });
    let downgraded = false;
    if (buffer.length > MAX_PNG_BYTES && fullPage) {
      buffer = await page.screenshot({ fullPage: false, type: 'png', caret: 'initial' });
      downgraded = true;
    }

    const dims = pngDimensions(buffer);
    const base64 = buffer.toString('base64');

    const warnings = [];
    if (health.hostErrorPage) {
      warnings.push(
        'The server returned its own error page instead of the SPA — deep links need rewrite rules (/* -> /index.html 200).'
      );
    }
    if (health.errorBoundaryVisible) warnings.push('A crash / error boundary is visible in the screenshot.');
    if (health.blankApp) warnings.push('The React root rendered nothing — the screenshot is a blank page.');
    if (status !== 200) warnings.push(`Route returned HTTP ${status}.`);
    if (downgraded) {
      warnings.push(`Full-page PNG exceeded ${Math.round(MAX_PNG_BYTES / 1024 / 1024)} MB, so only the viewport was captured.`);
    }
    const verdict =
      !health.hostErrorPage && !health.errorBoundaryVisible && !health.blankApp && status === 200 ? 'pass' : 'fail';

    return {
      imageBase64: base64,
      meta: {
        route: path,
        url: urlFor(path),
        httpStatus: status,
        title: health.title,
        h1Text: health.h1Text,
        rendered: health.rootChildCount > 0 && !health.blankApp,
        errorBoundaryVisible: health.errorBoundaryVisible,
        hostErrorPage: health.hostErrorPage,
        verdict,
        warnings,
        viewport: CONFIG.viewport,
        fullPage,
        downgradedToViewportOnly: downgraded,
        darkMode: args.darkMode ?? null,
        pngBytes: buffer.length,
        base64Length: base64.length,
        dimensions: dims,
      },
      diagnostics: diagnostics.summary(),
    };
  },

  /** Screenshots are returned as a real MCP image block plus a small JSON text block. */
  renderContent(envelope, result) {
    const { imageBase64, meta, diagnostics } = result;
    const textPayload = { ...envelope, result: { ...meta, image: '(returned as an image block above)' }, diagnostics };
    return [
      { type: 'image', data: imageBase64, mimeType: 'image/png' },
      { type: 'text', text: JSON.stringify(textPayload, null, 2) },
    ];
  },
};
