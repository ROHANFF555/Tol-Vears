# ToolsHub — Free Browser Tools

A growing collection of small, fast, privacy-friendly web tools. **Every tool runs 100%
client-side** — no backend, no database, no external APIs, no uploads. Your files and data
never leave your browser.

## Tools (Phase 1)

| Tool | Route | How it works |
| --- | --- | --- |
| 🖼️ Image Compressor | `/tools/image-compressor` | Canvas API re-encoding + quality slider, batch download as ZIP (JSZip) |
| 📄 PDF Merger | `/tools/pdf-merger` | pdf-lib in-browser merging with drag-to-reorder and page counts |
| 📱 QR Code Generator | `/tools/qr-code-generator` | `qrcode` npm package, live preview, PNG download in 3 sizes |
| 🔑 Password Generator | `/tools/password-generator` | `crypto.getRandomValues` with rejection sampling + entropy-based strength meter |
| 📐 Unit Converter | `/tools/unit-converter` | Length, weight & temperature conversions, live as you type |

Plus: homepage with **instant client-side search** (name / description / tags) and
**category filter buttons**, light/dark mode, responsive mobile-first design, and a
consistent "How to use" section on every tool page.

## Tech stack

- [Vite](https://vitejs.dev/) + React 19 (static SPA — no server code)
- [Tailwind CSS](https://tailwindcss.com/) v4
- [react-router-dom](https://reactrouter.com/) for routing
- [pdf-lib](https://pdf-lib.js.org/), [qrcode](https://www.npmjs.com/package/qrcode),
  [jszip](https://stuk.github.io/jszip/) — all running fully in the browser

## Local development

Requires Node.js ≥ 18.

```bash
npm install     # install dependencies
npm run dev     # start the dev server → http://localhost:5173
```

Other scripts:

```bash
npm run build   # production build → dist/
npm run preview # serve the production build locally → http://localhost:4173
npm run smoke   # node-based smoke tests (unit conversions, password logic, PDF merge, QR, ZIP)
```

## Deployment (free static hosting)

The site is a plain static SPA. `vercel.json` and `netlify.toml` are included, so importing
this repo into **Vercel** or **Netlify** (free tier) works with zero configuration:

- Build command: `npm run build`
- Publish directory: `dist`
- SPA rewrites to `/index.html` are already configured (both hosts)

No environment variables are needed.

## Testing

- `npm run smoke` — automated checks for conversion math, password generation/strength,
  pdf-lib merging, QR generation (incl. oversized-input rejection) and ZIP round-trips.
- `npm run build` must pass cleanly with no warnings/errors.
- Manual browser checks: every route loads with no console errors; tools are exercised with
  normal, empty and edge-case inputs (invalid files, oversized text, negative numbers, …).

## Roadmap

More tools (word counter, JSON formatter, color picker, …) and categories are planned.
Phase 2 ideas live in the issue tracker.

## License

MIT
