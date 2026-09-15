// Per-page diagnostics collection + error normalisation.
//
// Every tool result carries whatever the browser complained about (console errors, uncaught
// exceptions, failed requests, 4xx/5xx responses). That is often the most useful half of a
// test report: a tool can "pass" while the page is silently throwing.

const truncate = (text, max = 300) => {
  const s = String(text ?? '');
  return s.length > max ? `${s.slice(0, max)}…` : s;
};

export function attachDiagnostics(page) {
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  const badResponses = [];
  const CAP = 15;

  const push = (arr, item) => {
    if (arr.length < CAP) arr.push(item);
  };

  page.on('console', (message) => {
    try {
      const type = message.type();
      if (type !== 'error' && type !== 'warning') return;
      push(consoleErrors, { type, text: truncate(message.text()) });
    } catch {
      /* frame already gone — ignore */
    }
  });

  page.on('pageerror', (error) => {
    try {
      push(pageErrors, truncate(error?.message || String(error)));
    } catch {
      /* ignore */
    }
  });

  page.on('requestfailed', (request) => {
    try {
      push(failedRequests, {
        url: truncate(request.url(), 200),
        failure: request.failure()?.errorText || 'unknown',
      });
    } catch {
      /* ignore */
    }
  });

  page.on('response', (response) => {
    try {
      if (response.status() >= 400) {
        push(badResponses, { url: truncate(response.url(), 200), status: response.status() });
      }
    } catch {
      /* ignore */
    }
  });

  return {
    summary() {
      const out = {};
      if (consoleErrors.length) out.consoleErrors = consoleErrors;
      if (pageErrors.length) out.pageErrors = pageErrors;
      if (failedRequests.length) out.failedRequests = failedRequests;
      if (badResponses.length) out.badResponses = badResponses;
      return out;
    },
    /** True when nothing at all went wrong in the page. */
    clean() {
      return (
        consoleErrors.length === 0 &&
        pageErrors.length === 0 &&
        failedRequests.length === 0 &&
        badResponses.length === 0
      );
    },
  };
}

/**
 * Turn any thrown value (Playwright timeout, DOM error, assertion, …) into a short,
 * actionable description instead of a stack trace or a 40-line Playwright call log.
 */
export function describeError(err, { toolName, baseUrl } = {}) {
  const raw = err?.message ? String(err.message) : String(err ?? 'Unknown error');

  // Playwright appends a verbose "Call log:" block — the first lines are the useful part.
  const message = truncate(raw.split(/\n\s*(?:Call log:|-{5,})/)[0].trim(), 500);
  const name = err?.name || 'Error';

  let hint;
  if (/Timeout \d+ms exceeded/.test(raw)) {
    hint =
      'Timed out. The page may be slow or cold-starting (Render free tier spins down after ~15 min of inactivity — the first request can take 30-60s), or the element this test looks for never appeared (the UI may have changed).';
  } else if (/net::ERR_NAME_NOT_RESOLVED/.test(raw)) {
    hint = `Could not resolve the hostname of "${baseUrl || 'the target site'}". Check TOOLSHUB_URL.`;
  } else if (/net::ERR_CONNECTION_REFUSED/.test(raw)) {
    hint = `Connection refused by "${baseUrl || 'the target site'}". Is the server running?`;
  } else if (/net::ERR_(TIMED_OUT|CONNECTION_RESET|EMPTY_RESPONSE)/.test(raw)) {
    hint = 'The target site did not respond in time. Retry — a cold Render instance often needs a second attempt.';
  } else if (/net::ERR_CERT/.test(raw)) {
    hint = 'TLS certificate problem reaching the target site.';
  } else if (/hard deadline/.test(raw)) {
    hint = `The whole tool call was aborted after ${message.match(/(\d+) ms/)?.[1] || '?'} ms to keep the server responsive.`;
  } else if (/browser has been closed|Target closed|browser\.newContext: Target closed/.test(raw)) {
    hint = 'The shared browser instance was closed mid-test (crash or idle shutdown). The next call relaunches it automatically.';
  } else if (/ENOENT/.test(raw)) {
    hint = 'A file this test needs is missing — run `npm run fixtures` to regenerate the bundled test assets.';
  } else if (/Executable doesn't exist|looks like Playwright/.test(raw)) {
    hint =
      'Chromium is not installed. Run `npx playwright install --with-deps chromium`, or point CHROMIUM_EXECUTABLE_PATH at an existing Chrome/Chromium binary.';
  }

  return { tool: toolName, name, message, ...(hint ? { hint } : {}) };
}

export const isTimeoutError = (err) => /Timeout \d+ms exceeded|hard deadline/.test(String(err?.message || ''));
