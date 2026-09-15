// Central configuration — everything is overridable with environment variables so the same
// code runs locally (against `npm run serve-site`), in CI, and on Render (against production).
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..');

const int = (value, fallback) => {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

const bool = (value, fallback) =>
  value === undefined || value === '' ? fallback : /^(1|true|yes|on)$/i.test(String(value));

export const CONFIG = {
  /** Base URL of the ToolsHub deployment under test. */
  baseUrl: (
    process.env.TOOLSHUB_URL ||
    process.env.BASE_URL ||
    'https://tol-vears.onrender.com'
  ).replace(/\/+$/, ''),

  /** HTTP port the MCP server listens on. Render injects $PORT automatically. */
  port: int(process.env.PORT, 3000),
  host: process.env.HOST || '0.0.0.0',

  /** Per-step Playwright timeout (navigation, waiting for an element, …). */
  navTimeoutMs: int(process.env.NAV_TIMEOUT_MS, 15_000),
  stepTimeoutMs: int(process.env.STEP_TIMEOUT_MS, 15_000),

  /** Hard ceiling for a whole tool call, so one hung page can never wedge the server. */
  toolDeadlineMs: int(process.env.TOOL_DEADLINE_MS, 60_000),

  /** Close the browser after this much idle time (Render's free tier has 512 MB of RAM). */
  browserIdleMs: int(process.env.BROWSER_IDLE_MS, 5 * 60_000),

  /** Browser tests are serialized — one Chromium page at a time keeps memory flat. */
  headless: bool(process.env.HEADLESS, true),

  /** Optional pre-installed Chromium binary (locked-down hosts without Playwright's CDN). */
  chromiumExecutablePath:
    process.env.CHROMIUM_EXECUTABLE_PATH ||
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
    '',

  viewport: {
    width: int(process.env.VIEWPORT_WIDTH, 1280),
    height: int(process.env.VIEWPORT_HEIGHT, 900),
  },

  fixturesDir: process.env.FIXTURES_DIR || path.join(ROOT, 'fixtures'),
};

/** Routes exposed by ToolsHub (mirrors the <Routes> table in the site's App.jsx). */
export const ROUTES = {
  home: '/',
  imageCompressor: '/tools/image-compressor',
  pdfMerger: '/tools/pdf-merger',
  qrGenerator: '/tools/qr-code-generator',
  passwordGenerator: '/tools/password-generator',
  unitConverter: '/tools/unit-converter',
};

export const TOOL_ROUTES = [
  ROUTES.imageCompressor,
  ROUTES.pdfMerger,
  ROUTES.qrGenerator,
  ROUTES.passwordGenerator,
  ROUTES.unitConverter,
];

/** Deliberately bogus route used by check_all_routes to prove the SPA 404 page renders. */
export const FAKE_ROUTE = process.env.FAKE_ROUTE || '/nonexistent';

export const ALL_ROUTES = [ROUTES.home, ...TOOL_ROUTES, FAKE_ROUTE];

/** Absolute URL for a route path. */
export const urlFor = (route) => `${CONFIG.baseUrl}${route.startsWith('/') ? route : `/${route}`}`;

/** Fixture file path. */
export const fixture = (name) => path.join(CONFIG.fixturesDir, name);
