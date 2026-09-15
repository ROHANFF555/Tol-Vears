// Small DOM helpers shared by every tool.
//
// ToolsHub is a Vite + React 19 SPA with lazy-loaded routes, so two things need care:
//   * After navigation a Suspense fallback (`[role=status][aria-label="Loading page"]`) shows
//     for a moment — tests must wait for it to go away.
//   * React ignores naive `el.value = x` writes on controlled inputs; values must be set
//     through the native setter and announced with a bubbling `input` event.
import fs from 'node:fs';
import { CONFIG, urlFor } from './config.js';
import { isTimeoutError } from './diagnostics.js';

/** Navigate to an absolute URL and wait for the SPA to settle. Returns the HTTP response status. */
export async function gotoRoute(page, url, { timeout = CONFIG.navTimeoutMs, waitUntil = 'domcontentloaded' } = {}) {
  const response = await page.goto(url, { waitUntil, timeout });
  const status = response ? response.status() : null;
  await waitForAppRender(page, { timeout }).catch(() => {});
  return { status, finalUrl: page.url() };
}

/** Wait until either the React app has painted something, or the host returned an error page. */
export async function waitForAppRender(page, { timeout = CONFIG.stepTimeoutMs } = {}) {
  const loader = page.locator('[role="status"][aria-label="Loading page"]');
  await loader.waitFor({ state: 'detached', timeout }).catch(() => {});
  await page
    .waitForFunction(
      () => {
        const root = document.getElementById('root');
        if (root && root.children.length > 0 && (root.innerText || '').trim().length > 0) return true;
        // Static hosts (Render/Netlify/Vercel) may answer with their own plain-text error page.
        return Boolean(document.body && (document.body.innerText || '').trim().length > 0);
      },
      null,
      { timeout }
    )
    .catch(() => {});
}

/** Structured health read-out of whatever is currently on screen. */
export async function inspectPageHealth(page) {
  return page.evaluate(() => {
    const root = document.getElementById('root');
    const bodyText = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
    const h1 = document.querySelector('h1');
    return {
      title: document.title,
      url: location.href,
      hasRoot: Boolean(root),
      rootChildCount: root ? root.children.length : 0,
      rootTextLength: root ? (root.innerText || '').trim().length : 0,
      bodyTextPreview: bodyText.slice(0, 220),
      h1Text: h1 ? (h1.innerText || '').trim() : null,
      // React error boundaries / bundler crash screens / dev-overlay text.
      errorBoundaryVisible: /Minified React error|Something went wrong|Application error|Uncaught runtime error|Unexpected Application Error|Error boundary/i.test(
        bodyText
      ),
      // The SPA mounted but rendered nothing (blank screen of death).
      blankApp: Boolean(root) && root.children.length === 0,
      // A hosting-provider error page rather than the app (e.g. Render static site w/o rewrites).
      hostErrorPage: !root && /^(Not Found|404[:\s]|Access denied|Site not found|NoSuchKey)/i.test(bodyText),
    };
  });
}

/** Set a React-controlled `input[type=range]` (Playwright's fill() does not support ranges). */
export async function setRangeValue(page, selector, value) {
  const locator = page.locator(selector).first();
  await locator.waitFor({ state: 'attached', timeout: CONFIG.stepTimeoutMs });
  await locator.evaluate((el, v) => {
    const descriptor =
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value') ||
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value');
    descriptor.set.call(el, String(v));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
  return locator.inputValue();
}

/** Read the value of a `<label>Text</label><select>…</select>` style pair by its visible label. */
export async function readLabelValue(page, labelText) {
  return page.evaluate((label) => {
    const nodes = [...document.querySelectorAll('span, p, dt, label, div')];
    const node = nodes.find((el) => el.children.length === 0 && (el.textContent || '').trim() === label);
    if (!node) return null;
    const sibling = node.nextElementSibling;
    return sibling ? (sibling.textContent || '').replace(/\s+/g, ' ').trim() : null;
  }, labelText);
}

/** The FileDrop component renders one hidden `<input type=file>`; Playwright can fill it directly. */
export function fileInput(page) {
  return page.locator('input[type="file"]').first();
}

export async function uploadFiles(page, filePaths) {
  const paths = Array.isArray(filePaths) ? filePaths : [filePaths];
  for (const p of paths) {
    if (!fs.existsSync(p)) {
      throw new Error(
        `Fixture not found: ${p}. Run \`npm run fixtures\` inside toolshub-test-mcp to regenerate the bundled test assets.`
      );
    }
  }
  const input = fileInput(page);
  await input.waitFor({ state: 'attached', timeout: CONFIG.stepTimeoutMs });
  await input.setInputFiles(paths);
  return paths.map((p) => ({ path: p, name: p.split('/').pop(), bytes: fs.statSync(p).size }));
}

/**
 * Click something and capture the browser download it produces.
 * Downloads are read into memory *before* the context closes (Playwright deletes them after).
 */
export async function captureDownload(page, trigger, { timeout = CONFIG.stepTimeoutMs, readBuffer = false } = {}) {
  let download;
  try {
    [download] = await Promise.all([page.waitForEvent('download', { timeout }), trigger()]);
  } catch (err) {
    if (isTimeoutError(err)) {
      throw new Error(
        `No download started within ${timeout} ms after the click. The download link/button may be missing, disabled, or the export failed silently.`
      );
    }
    throw err;
  }

  const suggestedFilename = download.suggestedFilename();
  const path = await download.path();
  const result = { suggestedFilename, downloadPath: path, bytes: null };
  if (path && fs.existsSync(path)) {
    result.bytes = fs.statSync(path).size;
    if (readBuffer) result.buffer = fs.readFileSync(path);
  }
  return result;
}

/** Wait until `predicate()` is true in the page (poll-based, tolerant of React re-renders). */
export async function waitForPageState(page, predicate, arg, { timeout = CONFIG.stepTimeoutMs, label = 'condition' } = {}) {
  try {
    await page.waitForFunction(predicate, arg, { timeout, polling: 100 });
    return true;
  } catch (err) {
    if (isTimeoutError(err)) {
      throw new Error(`Timed out after ${timeout} ms waiting for: ${label}.`);
    }
    throw err;
  }
}

/** Wait for the site's "working…" spinner/text to disappear (compression, merging, …). */
export async function waitForWorkToFinish(page, busyMarkers, { timeout = CONFIG.stepTimeoutMs, label = 'work' } = {}) {
  return waitForPageState(
    page,
    (markers) => {
      const text = document.body?.innerText || '';
      return !markers.some((m) => text.includes(m));
    },
    busyMarkers,
    { timeout, label: `${label} to finish (no "${busyMarkers.join('" / "')}" left on the page)` }
  );
}

/** PNG width/height straight from the IHDR chunk — no image library needed. */
export function pngDimensions(buffer) {
  if (!buffer || buffer.length < 24) return null;
  const isPng =
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  if (!isPng) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/** Decode a `data:image/png;base64,…` URL into a Buffer. */
export function dataUrlToBuffer(dataUrl) {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(String(dataUrl || ''));
  if (!match) return null;
  const [, mimeType, isBase64, data] = match;
  return {
    mimeType: mimeType || 'application/octet-stream',
    buffer: isBase64 ? Buffer.from(data, 'base64') : Buffer.from(decodeURIComponent(data), 'utf8'),
  };
}

/**
 * Navigate to a ToolsHub route and assert the SPA actually rendered.
 * Throws a descriptive error (never a crash) when the host returns its own 404 page, when the
 * React root stays empty, or when an error boundary is visible.
 */
export async function openTool(page, route) {
  const url = urlFor(route);
  const { status, finalUrl } = await gotoRoute(page, url);
  const health = await inspectPageHealth(page);

  if (health.hostErrorPage || (!health.hasRoot && status !== null && status >= 400)) {
    throw new Error(
      `Route ${route} never loaded the ToolsHub app: HTTP ${status} and the server answered with its own page ("${health.bodyTextPreview}"). ` +
        'On a static host this almost always means SPA rewrite rules are missing, so deep links only work when navigated to client-side.'
    );
  }
  if (health.blankApp) {
    throw new Error(`Route ${route} returned HTTP ${status} but the React root rendered nothing (blank page).`);
  }
  if (health.errorBoundaryVisible) {
    throw new Error(`Route ${route} rendered a visible error boundary / crash screen: "${health.bodyTextPreview}"`);
  }
  return { url, status, finalUrl, health };
}

/**
 * Wait for a debounced background job to *start* (bounded grace period), then wait for it to
 * finish. Used after moving a slider, where the app re-processes files ~300 ms later.
 */
export async function waitForBusyThenIdle(page, busyMarkers, { startGraceMs = 1500, timeout = CONFIG.stepTimeoutMs } = {}) {
  await Promise.race([
    page
      .waitForFunction(
        (markers) => markers.some((m) => (document.body?.innerText || '').includes(m)),
        busyMarkers,
        { timeout: startGraceMs, polling: 50 }
      )
      .catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, startGraceMs)),
  ]);
  return waitForWorkToFinish(page, busyMarkers, { timeout });
}

/**
 * Read text from an element that may well not exist — WITHOUT burning the full timeout on it.
 * `locator.count()` resolves immediately, so an absent optional element costs ~0 ms instead of
 * 15 s (a plain `.innerText().catch(() => null)` would wait for the element to appear first).
 */
export async function optionalText(locator, { timeout = 1000 } = {}) {
  try {
    if ((await locator.count()) === 0) return null;
    const text = await locator.first().innerText({ timeout });
    return (text || '').replace(/\s+/g, ' ').trim() || null;
  } catch {
    return null;
  }
}

/** Same, but for an attribute. */
export async function optionalAttribute(locator, name, { timeout = 1000 } = {}) {
  try {
    if ((await locator.count()) === 0) return null;
    return await locator.first().getAttribute(name, { timeout });
  } catch {
    return null;
  }
}

/** Is an optional element present *and* enabled? Never waits. */
export async function optionalEnabled(locator) {
  try {
    if ((await locator.count()) === 0) return false;
    return await locator.first().evaluate((el) => !el.disabled);
  } catch {
    return false;
  }
}
