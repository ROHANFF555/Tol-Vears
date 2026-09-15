// check_all_routes — visits the homepage, all five tool routes and one deliberately bogus route,
// recording the HTTP status and whether the React app actually rendered (vs. a blank root, a
// visible error boundary, or the static host's own "Not Found" page).
import { ALL_ROUTES, CONFIG, FAKE_ROUTE, ROUTES, urlFor } from '../config.js';
import { gotoRoute, inspectPageHealth } from '../dom.js';

const APP_ROUTES = [ROUTES.home, ...Object.values(ROUTES).filter((r) => r !== ROUTES.home)];

function classify({ route, status, health }) {
  const isFake = route === FAKE_ROUTE;
  const appRendered = health.hasRoot && health.rootChildCount > 0 && health.rootTextLength > 0;

  if (health.hostErrorPage || (!health.hasRoot && status !== null && status >= 400)) {
    return {
      rendered: false,
      verdict: 'host-error-page',
      detail:
        `The web server answered with its own error page instead of the SPA (HTTP ${status}). ` +
        (isFake
          ? 'For the bogus route this hides whether the app-level 404 page works at all.'
          : 'Deep links are broken for anyone who reloads or shares this URL — the static host needs SPA rewrite rules (/* -> /index.html 200).'),
    };
  }
  if (health.errorBoundaryVisible) {
    return { rendered: appRendered, verdict: 'error-boundary', detail: 'A crash / error boundary is visible on the page.' };
  }
  if (health.blankApp || !appRendered) {
    return { rendered: false, verdict: 'blank-page', detail: 'The React root mounted but rendered nothing.' };
  }
  if (status !== null && status >= 400) {
    return {
      rendered: true,
      verdict: 'unexpected-status',
      detail: `The app rendered but the server returned HTTP ${status}.`,
    };
  }
  if (isFake) {
    const showsApp404 = /page not found/i.test(health.h1Text || '') || /page not found/i.test(health.title || '');
    return {
      rendered: true,
      verdict: showsApp404 ? 'ok-app-404-page' : 'ok-but-no-404-page',
      detail: showsApp404
        ? 'The bogus URL correctly renders the app\'s own "Page not found" screen (HTTP 200, as an SPA should).'
        : 'The bogus URL rendered the app but not its "Page not found" screen.',
    };
  }
  return { rendered: true, verdict: 'ok', detail: 'Rendered normally with HTTP 200.' };
}

export const checkAllRoutesTool = {
  name: 'check_all_routes',
  title: 'Check All Routes',
  description:
    'Visits the ToolsHub homepage, all five tool routes and one deliberately bogus route (/nonexistent) in a real browser. For each route it reports the HTTP status, whether the React app rendered without a blank root / error boundary / host-level 404 page, the page title and any console errors. This is the fastest way to spot broken deep links or a missing SPA rewrite rule.',
  inputSchema: {
    type: 'object',
    properties: {
      extraRoutes: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional additional route paths to check, e.g. ["/tools/word-counter"].',
      },
    },
    additionalProperties: false,
  },

  async run({ page, diagnostics }, args = {}) {
    const extras = Array.isArray(args.extraRoutes) ? args.extraRoutes.filter((r) => typeof r === 'string') : [];
    const routes = [...new Set([...ALL_ROUTES, ...extras.map((r) => (r.startsWith('/') ? r : `/${r}`))])];

    const results = [];
    for (const route of routes) {
      const startedAt = Date.now();
      const entry = { route, url: urlFor(route) };
      try {
        const { status, finalUrl } = await gotoRoute(page, urlFor(route), { timeout: CONFIG.navTimeoutMs });
        const health = await inspectPageHealth(page);
        const classification = classify({ route, status, health });
        Object.assign(entry, {
          httpStatus: status,
          finalUrl,
          title: health.title,
          h1Text: health.h1Text,
          rendered: classification.rendered,
          verdict: classification.verdict,
          detail: classification.detail,
          bodyTextPreview: health.bodyTextPreview,
          loadMs: Date.now() - startedAt,
          isToolRoute: APP_ROUTES.includes(route) && route !== ROUTES.home,
          isFakeRoute: route === FAKE_ROUTE,
        });
      } catch (err) {
        Object.assign(entry, {
          httpStatus: null,
          rendered: false,
          verdict: 'navigation-error',
          detail: String(err?.message || err).split('\n')[0].slice(0, 400),
          loadMs: Date.now() - startedAt,
        });
      }
      results.push(entry);
    }

    const problems = results.filter((r) => !['ok', 'ok-app-404-page'].includes(r.verdict));
    const pageErrors = diagnostics.summary();

    return {
      baseUrl: CONFIG.baseUrl,
      verdict: problems.length === 0 ? 'pass' : 'fail',
      routesChecked: results.length,
      ok: results.length - problems.length,
      problems: problems.length,
      summary: results.map((r) => `${r.route} → HTTP ${r.httpStatus} · ${r.verdict}`),
      results,
      ...(problems.length
        ? {
            headline: problems
              .map((p) => `${p.route}: ${p.verdict} — ${p.detail}`)
              .join(' | '),
          }
        : { headline: 'Every route rendered correctly.' }),
      browserDiagnostics: pageErrors,
    };
  },
};
