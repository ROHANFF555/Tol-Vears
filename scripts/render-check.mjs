// Server-side render check: renders every page through Vite's transform pipeline to catch
// render-time crashes without needing a browser. Run with: npm run check:render

import { createServer } from 'vite';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server.js';
import React from 'react';

// Minimal browser globals needed at render time (ThemeToggle reads document at init).
globalThis.document = {
  documentElement: {
    classList: { contains: () => false, add() {}, remove() {}, toggle() {} },
  },
  title: '',
  createElement: () => ({ style: {}, select() {}, click() {}, remove() {}, setAttribute() {} }),
  body: { appendChild() {}, removeChild() {} },
};
globalThis.window = {
  matchMedia: () => ({ matches: false }),
  setTimeout,
  clearTimeout,
  scrollTo() {},
};
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const vite = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});

const pages = [
  ['/', '/src/pages/Home.jsx', '/'],
  ['/tools/image-compressor', '/src/pages/tools/ImageCompressor.jsx', '/tools/image-compressor'],
  ['/tools/pdf-merger', '/src/pages/tools/PdfMerger.jsx', '/tools/pdf-merger'],
  ['/tools/qr-code-generator', '/src/pages/tools/QrGenerator.jsx', '/tools/qr-code-generator'],
  ['/tools/password-generator', '/src/pages/tools/PasswordGenerator.jsx', '/tools/password-generator'],
  ['/tools/unit-converter', '/src/pages/tools/UnitConverter.jsx', '/tools/unit-converter'],
  ['/404', '/src/pages/NotFound.jsx', '/does-not-exist'],
];

let failed = 0;
for (const [name, modulePath, route] of pages) {
  try {
    const { default: Page } = await vite.ssrLoadModule(modulePath);
    const html = renderToString(
      React.createElement(
        StaticRouter,
        { location: route },
        React.createElement(Page)
      )
    );
    if (!html || html.length < 100) throw new Error('suspiciously small render output');
    console.log(`  ✓ ${name} rendered (${html.length} chars)`);
  } catch (err) {
    failed += 1;
    process.exitCode = 1;
    console.error(`  ✗ ${name}\n    ${err.message}`);
  }
}

// Layout shell (header, theme toggle, footer) — rendered around the Home page.
try {
  const { default: Layout } = await vite.ssrLoadModule('/src/components/Layout.jsx');
  const { default: Home } = await vite.ssrLoadModule('/src/pages/Home.jsx');
  const html = renderToString(
    React.createElement(
      StaticRouter,
      { location: '/' },
      React.createElement(Layout, null, React.createElement(Home))
    )
  );
  if (!html.includes('ToolsHub') || !html.includes('Image Compressor')) {
    throw new Error('layout is missing expected content');
  }
  console.log(`  ✓ full layout + home rendered (${html.length} chars)`);
} catch (err) {
  failed += 1;
  process.exitCode = 1;
  console.error(`  ✗ layout shell\n    ${err.message}`);
}

await vite.close();
console.log(failed === 0 ? '\nAll pages render cleanly.' : `\n${failed} page(s) failed to render.`);
if (failed > 0) process.exit(1);
