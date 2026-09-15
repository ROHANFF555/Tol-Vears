// Shared Chromium lifecycle.
//
// Design goals (explicitly required for this server):
//   1. Never leak pages/contexts — every call gets a fresh BrowserContext that is ALWAYS
//      closed in a finally block, even when the test throws or hits its hard deadline.
//   2. Never let one hung test block the server — each call has a hard deadline.
//   3. Stay inside a 512 MB Render free-tier instance — tests are serialized (one page at a
//      time) and the browser is shut down after a period of idleness.
//   4. Self-heal — if Chromium crashes, the next call relaunches it.
import { chromium } from 'playwright';
import { CONFIG } from './config.js';
import { attachDiagnostics } from './diagnostics.js';

// Render/Docker containers run as root with a small /dev/shm; these flags are mandatory there.
const LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--hide-scrollbars',
  '--mute-audio',
  '--force-color-profile=srgb',
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
];

async function withDeadline(promise, ms, label) {
  let timer;
  const guard = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Tool "${label}" exceeded its hard deadline of ${ms} ms and was aborted.`)),
      ms
    );
  });
  try {
    return await Promise.race([promise, guard]);
  } finally {
    clearTimeout(timer);
  }
}

class BrowserManager {
  constructor() {
    this.browser = null;
    this.launching = null;
    this.chain = Promise.resolve();
    this.idleTimer = null;
    this.stats = {
      launches: 0,
      crashes: 0,
      runs: 0,
      failures: 0,
      contextsOpened: 0,
      contextsClosed: 0,
      lastTool: null,
      lastRunDurationMs: null,
      lastRunAt: null,
    };
  }

  async launch() {
    if (this.browser?.isConnected()) return this.browser;
    if (this.launching) return this.launching;

    this.launching = (async () => {
      const options = { headless: CONFIG.headless, args: LAUNCH_ARGS };
      if (CONFIG.chromiumExecutablePath) options.executablePath = CONFIG.chromiumExecutablePath;

      const browser = await chromium.launch(options);
      browser.on('disconnected', () => {
        if (this.browser === browser) {
          this.browser = null;
          this.stats.crashes += 1;
        }
      });
      this.browser = browser;
      this.stats.launches += 1;
      return browser;
    })().finally(() => {
      this.launching = null;
    });

    return this.launching;
  }

  /** Run `fn({ page, context, diagnostics })` with a fresh, guaranteed-to-close context. */
  run(toolName, fn) {
    const task = this.chain.then(() => this.#execute(toolName, fn));
    // Keep the queue alive no matter what an individual test does.
    this.chain = task.then(
      () => undefined,
      () => undefined
    );
    return task;
  }

  async #execute(toolName, fn) {
    const startedAt = Date.now();
    this.stats.runs += 1;
    this.stats.lastTool = toolName;

    const browser = await this.launch();
    let context = null;
    let diagnostics = null;
    try {
      context = await browser.newContext({
        viewport: CONFIG.viewport,
        acceptDownloads: true,
        locale: 'en-US',
        timezoneId: 'UTC',
        deviceScaleFactor: 1,
        // Identify ourselves to the site under test (a custom userAgent string is rejected by
        // some Chromium builds, so we use a header instead).
        extraHTTPHeaders: { 'X-Tested-By': 'toolshub-test-mcp' },
      });
      this.stats.contextsOpened += 1;
      context.setDefaultTimeout(CONFIG.stepTimeoutMs);

      const page = await context.newPage();
      page.setDefaultTimeout(CONFIG.stepTimeoutMs);
      page.setDefaultNavigationTimeout(CONFIG.navTimeoutMs);

      diagnostics = attachDiagnostics(page);
      const result = await withDeadline(
        fn({ page, context, diagnostics, toolName }),
        CONFIG.toolDeadlineMs,
        toolName
      );
      return result;
    } catch (err) {
      this.stats.failures += 1;
      // Attach whatever the page logged before it failed — usually the real explanation.
      if (err && typeof err === 'object' && diagnostics) {
        try {
          err.diagnostics = diagnostics.summary();
        } catch {
          /* ignore */
        }
      }
      throw err;
    } finally {
      if (context) {
        // Closing the context closes every page AND deletes temp download files — this is the
        // single most important line for not leaking memory across repeated calls.
        await context.close().catch(() => {});
        this.stats.contextsClosed += 1;
      }
      this.stats.lastRunDurationMs = Date.now() - startedAt;
      this.stats.lastRunAt = new Date().toISOString();
      this.#scheduleIdleClose();
    }
  }

  #scheduleIdleClose() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (!CONFIG.browserIdleMs) return;
    this.idleTimer = setTimeout(() => {
      this.close('idle-timeout').catch(() => {});
    }, CONFIG.browserIdleMs);
    this.idleTimer.unref?.();
  }

  async close(reason = 'explicit') {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    const browser = this.browser;
    this.browser = null;
    if (browser) await browser.close().catch(() => {});
    return reason;
  }

  snapshot() {
    return {
      browserRunning: Boolean(this.browser?.isConnected()),
      browserVersion: this.browser?.version?.() ?? null,
      contextsOpen: this.stats.contextsOpened - this.stats.contextsClosed,
      ...this.stats,
    };
  }
}

/** Process-wide singleton: one browser, shared by every MCP session. */
export const browserManager = new BrowserManager();
