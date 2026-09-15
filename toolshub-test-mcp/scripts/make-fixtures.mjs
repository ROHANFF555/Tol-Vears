// Regenerates the bundled test fixtures.
//
//   fixtures/test-image.jpg  a real, compressible JPEG (gradient + noise, encoded at q92 so
//                            re-encoding at q50 is guaranteed to shrink it)
//   fixtures/sample-a.pdf    2-page PDF
//   fixtures/sample-b.pdf    3-page PDF   (=> the merged result must have 5 pages)
//
// Run with: npm run fixtures
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jpeg from 'jpeg-js';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = path.join(ROOT, 'fixtures');

/* ------------------------------------------------------------------ image */

function makeTestJpeg({ width = 960, height = 640, quality = 92 } = {}) {
  const data = Buffer.alloc(width * height * 4);
  // Deterministic PRNG so the fixture is byte-identical on every regeneration.
  let seed = 0x2f6e2b1;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      // Smooth diagonal gradients + high-frequency noise: the gradients survive quantisation
      // while the noise is what a lossy encoder actually throws away at lower quality.
      const gx = x / width;
      const gy = y / height;
      const noise = rand() * 48 - 24;
      data[i] = clamp(40 + gx * 190 + noise);
      data[i + 1] = clamp(30 + gy * 170 + Math.sin(gx * 12) * 30 + noise);
      data[i + 2] = clamp(90 + (1 - gx) * 150 + Math.cos(gy * 9) * 35 + noise);
      data[i + 3] = 255;
    }
  }
  return jpeg.encode({ data, width, height }, quality).data;
}

const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));

/* ------------------------------------------------------------------- pdfs */

async function makeTestPdf({ title, pageCount, hue }) {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setProducer('toolshub-test-mcp fixture generator');
  const font = await doc.embedFont(StandardFonts.HelveticaBold);

  for (let i = 1; i <= pageCount; i++) {
    const page = doc.addPage([420, 560]);
    page.drawRectangle({ x: 0, y: 480, width: 420, height: 80, color: rgb(hue[0], hue[1], hue[2]) });
    page.drawText(title, { x: 28, y: 512, size: 22, font, color: rgb(1, 1, 1) });
    page.drawText(`Page ${i} of ${pageCount}`, { x: 28, y: 440, size: 18, font, color: rgb(0.2, 0.2, 0.25) });
    page.drawText(
      `Fixture for the ToolsHub PDF Merger test. ${i}/${pageCount}`,
      { x: 28, y: 410, size: 11, font, color: rgb(0.45, 0.45, 0.5) }
    );
    for (let line = 0; line < 12; line++) {
      page.drawText('Lorem ipsum dolor sit amet, consectetur adipiscing elit sed do eiusmod.', {
        x: 28,
        y: 370 - line * 22,
        size: 10,
        font,
        color: rgb(0.6, 0.6, 0.65),
      });
    }
  }
  return doc.save();
}

/* ------------------------------------------------------------------- main */

fs.mkdirSync(FIXTURES, { recursive: true });

const image = makeTestJpeg();
fs.writeFileSync(path.join(FIXTURES, 'test-image.jpg'), image);
console.log(`✓ fixtures/test-image.jpg  ${image.length.toLocaleString()} bytes (960×640, JPEG q92)`);

const specs = [
  { file: 'sample-a.pdf', title: 'Sample A', pageCount: 2, hue: [0.24, 0.45, 0.85] },
  { file: 'sample-b.pdf', title: 'Sample B', pageCount: 3, hue: [0.85, 0.32, 0.4] },
];

for (const spec of specs) {
  const bytes = await makeTestPdf(spec);
  fs.writeFileSync(path.join(FIXTURES, spec.file), bytes);
  console.log(`✓ fixtures/${spec.file}  ${bytes.length.toLocaleString()} bytes (${spec.pageCount} pages)`);
}

console.log(`\nExpected merged page count: ${specs.reduce((n, s) => n + s.pageCount, 0)}`);
