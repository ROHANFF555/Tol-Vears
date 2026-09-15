# ToolsHub Testing MCP Server

An [MCP](https://modelcontextprotocol.io) server that lets Claude **test the live ToolsHub site
by driving a real headless Chromium browser** — clicking buttons, uploading files, downloading
results, taking screenshots — instead of guessing from screenshots a human pastes into a chat.

It is a **separate service** from ToolsHub. It never modifies the site; it tests it from the
outside, exactly like a real user would.

```
Claude  ──MCP over HTTP──▶  this server  ──Playwright──▶  Chromium  ──▶  https://tol-vears.onrender.com
                            (Node/Express)                (headless)      the real, deployed site
```

**Connect Claude with this URL:** `https://toolshub-test-mcp.onrender.com/mcp`
(Settings → Connectors → Add remote MCP server. Legacy clients can use `/sse` instead.)

---

## The tools

Every tool returns structured JSON: what the page claimed, what was independently measured, a
`verdict` (`pass` / `pass-with-warning` / `fail`), a `warnings` array, and any console errors the
page produced while it was being tested.

| Tool | Input | What it really does |
| --- | --- | --- |
| `test_image_compressor` | `quality?` (10-100, default 50), `outputFormat?` | Uploads `fixtures/test-image.jpg`, moves the quality slider, waits for the Canvas re-encode, **clicks Download and measures the actual output bytes on disk**. Reports original vs compressed size, % saved, whether the download button appeared and worked. |
| `test_pdf_merger` | — | Uploads `fixtures/sample-a.pdf` (2 pages) + `fixtures/sample-b.pdf` (3 pages), merges, downloads `merged.pdf` and **parses it with pdf-lib** to count pages for real. Compares the page's claim against ground truth. |
| `test_qr_generator` | `text?` (default `https://example.com`), `size?` (`sm`/`md`/`lg`) | Types the text, waits for the QR `<img>`, reports rendered vs intrinsic pixel size, then clicks *Download PNG* and validates the file is a genuine PNG of the promised size. |
| `test_password_generator` | `length?` (4-64, default 16), `options?` (`uppercase`/`lowercase`/`numbers`/`symbols`, all default true) | Sets the slider and all four checkboxes, clicks *Generate*, reads the password back and **independently verifies** its real length, which character classes it actually contains, and whether the strength meter agrees with the entropy math. |
| `test_unit_converter` | `category` (`Length`/`Weight`/`Temperature`), `from_unit`, `to_unit`, `value` | Picks the category pill, selects both units, types the value and returns exactly what the page displays — plus the same conversion computed by this server, so the math can be checked rather than trusted. |
| `check_all_routes` | `extraRoutes?` | Visits `/`, all five tool routes and one bogus route. Reports HTTP status, whether React actually rendered (vs a blank root, a visible error boundary, or the **host's own 404 page**), page title and console errors. |
| `get_screenshot` | `route`, `fullPage?`, `darkMode?` | Renders the route at 1280×900 and returns a **full-page PNG as a real MCP image block**, so layout/design issues can be inspected visually. |

Unit inputs are forgiving: `from_unit` accepts `"km"`, `"KM"`, `"Kilometer"`, `"kilometers"`,
`"Kilometer (km)"` or `"(km)"`; `category` accepts `"temp"`, `"mass"`, etc. Bad input returns a
clear message listing the valid options — it never crashes the server.

### Error handling

* Every step has a timeout (`NAV_TIMEOUT_MS` / `STEP_TIMEOUT_MS`, 15 s by default) and every tool
  call has a hard deadline (`TOOL_DEADLINE_MS`, 60 s) so a hung page can never wedge the server.
* Failures come back as `ok: false` + `isError: true` with a one-line message **and a `hint`**
  (cold start? unreachable host? Chromium not installed? selector gone?), plus whatever the page
  logged to the console before it failed.
* Argument validation happens *before* the browser is touched, so bad input fails in ~40 ms.

---

## Running locally

Requires Node ≥ 18 (22 recommended) and a Chromium install.

```bash
cd toolshub-test-mcp
npm install
npx playwright install --with-deps chromium   # one-off: downloads Chromium + OS libraries

npm start                                     # → http://localhost:3000/mcp
```

By default it tests production (`https://tol-vears.onrender.com`). To test a local build instead:

```bash
# terminal 1 — build and serve the ToolsHub site
cd .. && npm install && npm run build && cd toolshub-test-mcp
npm run serve-site                            # serves ../dist on :4173 with SPA rewrites

# terminal 2 — run the MCP server against it
TOOLSHUB_URL=http://localhost:4173 npm start
```

`npm run serve-site -- --no-rewrite` deliberately serves deep links as 404s, which reproduces the
"static host is missing SPA rewrite rules" bug so `check_all_routes` can be seen catching it.

### Connecting a local client

Any MCP client works. For Claude Desktop / Cursor, point it at `http://localhost:3000/mcp`, or use
the bundled verifier, which is a real MCP client talking over the wire:

```bash
npm run verify                                # calls every tool once, prints a report
npm run verify -- --repeat 5                  # stability / memory-leak check
npm run verify -- --only test_pdf_merger
npm run verify:errors                         # the failure-path matrix
npm test                                      # 22 unit tests for the verification logic
MCP_URL=https://toolshub-test-mcp.onrender.com/mcp npm run verify   # after deploying
```

---

## Deploying on Render

This is a **Web Service** (a long-running Node process), *not* a static site.

1. Push this folder to a repository Render can see.
   * Standalone repo → skip to step 2.
   * Inside the ToolsHub monorepo → set the service's **Root Directory** to `toolshub-test-mcp`
     (Render dashboard → service → Settings → Root Directory).
2. **New → Blueprint** and point it at `render.yaml`, *or* **New → Web Service** with:
   * **Runtime:** Docker (`Dockerfile` is in this folder)
   * **Plan:** Free
   * **Health check path:** `/health`
   * **Env var:** `TOOLSHUB_URL=https://tol-vears.onrender.com`
3. Deploy. The Dockerfile runs `npx playwright install --with-deps chromium`, so Chromium and its
   system libraries are baked into the image — nothing is downloaded at runtime.

Your MCP endpoint is then:

```
https://<service-name>.onrender.com/mcp        ← add this as a remote MCP connector
https://<service-name>.onrender.com/health     ← browser/session/memory status
https://<service-name>.onrender.com/           ← human-readable index of the tools
```

> **Free tier cold starts.** Render spins the service down after ~15 minutes without traffic, and
> the first request can take 30-60 s to wake it. A tool call that lands on a cold instance may
> time out; just call it again. `BROWSER_IDLE_MS` (default 5 min) closes Chromium between bursts
> so the instance stays inside its 512 MB budget.

### Native Node instead of Docker

Set Build Command to `npm ci && npx playwright install --with-deps chromium` and Start Command to
`npm start` (see the commented block at the bottom of `render.yaml`).

---

## Configuration

| Env var | Default | Purpose |
| --- | --- | --- |
| `TOOLSHUB_URL` | `https://tol-vears.onrender.com` | Site under test (trailing slashes trimmed). |
| `PORT` / `HOST` | `3000` / `0.0.0.0` | Listen address. Render injects `PORT`. |
| `NAV_TIMEOUT_MS` | `15000` | Per-navigation timeout. |
| `STEP_TIMEOUT_MS` | `15000` | Timeout for each wait/click/read. |
| `TOOL_DEADLINE_MS` | `60000` | Hard ceiling for one whole tool call. |
| `BROWSER_IDLE_MS` | `300000` | Close Chromium after this much idle time (0 = never). |
| `HEADLESS` | `true` | Set `false` to watch the browser locally. |
| `VIEWPORT_WIDTH` / `VIEWPORT_HEIGHT` | `1280` / `900` | Browser viewport (affects screenshots and `sm:` breakpoints). |
| `CHROMIUM_EXECUTABLE_PATH` | — | Use an existing Chrome/Chromium binary instead of Playwright's. |
| `FIXTURES_DIR` | `./fixtures` | Where the bundled test assets live. |
| `FAKE_ROUTE` | `/nonexistent` | Bogus route used by `check_all_routes`. |

---

## How it stays stable

* **One browser, one context per call.** Chromium is launched lazily and reused; every tool call
  gets a *fresh* `BrowserContext` that is closed in a `finally` block — even when the test throws
  or hits its deadline. Closing the context also deletes Playwright's temp download files.
* **Serialized tests.** Calls are queued, so only one page exists at a time (512 MB friendly).
* **Self-healing.** If Chromium crashes or is closed on idle, the next call relaunches it.
* **Idle shutdown.** The browser is closed after `BROWSER_IDLE_MS` of inactivity.
* `/health` exposes `contextsOpen`, `runs`, `failures`, `crashes` and RSS so leaks are visible.

Measured locally: 54 consecutive tool calls across 5 rounds → `contextsOpen` stayed at `0`,
`failures` at `0`, RSS 160 MB → 177 MB (plateau, no growth per call).

---

## Fixtures

Small, committed, and reproducible with `npm run fixtures`:

| File | Contents |
| --- | --- |
| `fixtures/test-image.jpg` | 960×640 JPEG (~303 KB) encoded at q92 from a deterministic gradient + noise, so re-encoding at q50 is guaranteed to shrink it. |
| `fixtures/sample-a.pdf` | 2-page PDF (~2 KB). |
| `fixtures/sample-b.pdf` | 3-page PDF (~3 KB) — the merged result must therefore be 5 pages. |

The fixture generator uses a fixed PRNG seed, so regeneration produces byte-identical files.

---

## Project layout

```
src/
  server.js            Express app: /mcp (Streamable HTTP), /sse + /messages (legacy), /health, /
  browser.js           Chromium lifecycle: lazy launch, queue, per-call context, idle shutdown
  diagnostics.js       Console/page-error/request-failure capture + human-readable error hints
  dom.js               SPA-aware navigation, React-safe input setting, download capture, PNG helpers
  verify.js            The independent check logic: password classes/entropy, unit math, text parsing
  config.js            Env config, route table
  tools/               One file per MCP tool + the registry that turns calls into MCP results
scripts/
  verify-all.mjs       Real MCP client: runs every tool and prints a report
  verify-errors.mjs    Failure-path matrix (bad args, dead site, oversized input, unknown tool)
  static-server.mjs    Serves ToolsHub's dist/ locally, with or without SPA rewrites
  make-fixtures.mjs    Regenerates the bundled test assets
test/verify.test.mjs   Unit tests for the pure verification logic (no browser needed)
```

### Adding a tool

1. Create `src/tools/myTool.js` exporting `{ name, title, description, inputSchema, run }`.
   `run({ page, diagnostics }, args)` gets a fresh page and returns a plain object.
2. Add it to the `TOOLS` array in `src/tools/index.js`.
3. Add a sample call to `scripts/verify-all.mjs` and unit-test any new pure logic in
   `src/verify.js`.

Error handling, the hard deadline, context cleanup and the JSON envelope are all handled by the
registry — a tool only has to describe its own steps.

---

## Notes & known limitations

* The server tests whatever `TOOLSHUB_URL` points at. Point it at a preview deployment to test a
  branch before merging.
* Selectors are written against the site's real markup (`#ic-quality`, `#qr-text`, `#pw-length`,
  `#uc-value`, `img[alt="Generated QR code"]`, `a[download="merged.pdf"]`, aria labels, …). If the
  UI is redesigned, the tools report a timeout plus the page's console output rather than silently
  passing — update the selector in the corresponding `src/tools/*.js` file.
* Tests are serialized by design, so N parallel Claude calls queue rather than run concurrently.
* A random password is not guaranteed to contain one character of every requested class; a missing
  class is reported as a warning with that caveat, not as a hard failure.

## License

MIT
