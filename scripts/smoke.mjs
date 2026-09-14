// Node-based smoke tests for the pure logic + client libraries used by ToolsHub.
// Run with: npm run smoke
// (Canvas-based image compression can't run in Node — that path is verified in the browser.)

import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import QRCode from 'qrcode';
import JSZip from 'jszip';
import { formatBytes, formatNumber, baseName } from '../src/lib/format.js';
import { CONVERSION_CATEGORIES, convertValue } from '../src/lib/converters.js';
import {
  CHAR_SETS,
  buildPool,
  generatePassword,
  passwordStrength,
} from '../src/lib/password.js';

let passed = 0;
let failed = 0;

function ok(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}\n    ${err.message}`);
    process.exitCode = 1;
  }
}

async function okAsync(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}\n    ${err.message}`);
    process.exitCode = 1;
  }
}

const approx = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(b));

console.log('\nUnit Converter');
ok('1 km → mi ≈ 0.621371192', () =>
  assert.ok(approx(convertValue('length', 'km', 'mi', 1), 0.621371192))
);
ok('1 m → ft ≈ 3.280839895', () =>
  assert.ok(approx(convertValue('length', 'm', 'ft', 1), 3.280839895))
);
ok('1 inch → cm = 2.54', () => assert.ok(approx(convertValue('length', 'in', 'cm', 1), 2.54)));
ok('negative length: -5 m → ft ≈ -16.404199', () =>
  assert.ok(approx(convertValue('length', 'm', 'ft', -5), -16.404199475065616))
);
ok('-40 °C → °F = -40', () => assert.equal(convertValue('temperature', 'c', 'f', -40), -40));
ok('212 °F → °C = 100', () => assert.ok(approx(convertValue('temperature', 'f', 'c', 212), 100)));
ok('0 °C → K = 273.15', () => assert.ok(approx(convertValue('temperature', 'c', 'k', 0), 273.15)));
ok('0 K → °C = -273.15', () => assert.ok(approx(convertValue('temperature', 'k', 'c', 0), -273.15)));
ok('5 kg → lb ≈ 11.0231', () =>
  assert.ok(approx(convertValue('weight', 'kg', 'lb', 5), 11.023113109243878))
);
ok('1 t → oz ≈ 35273.9619', () =>
  assert.ok(approx(convertValue('weight', 't', 'oz', 1), 35273.961949580415))
);
ok('every category has ≥2 units and valid defaults', () => {
  for (const [key, cat] of Object.entries(CONVERSION_CATEGORIES)) {
    assert.ok(Object.keys(cat.units).length >= 2, `${key} needs ≥2 units`);
    assert.ok(cat.units[cat.defaults.from], `${key} default "from" exists`);
    assert.ok(cat.units[cat.defaults.to], `${key} default "to" exists`);
  }
});

console.log('\nFormatting helpers');
ok("formatBytes(0) === '0 B'", () => assert.equal(formatBytes(0), '0 B'));
ok("formatBytes(1536) === '1.5 KB'", () => assert.equal(formatBytes(1536), '1.5 KB'));
ok("formatBytes(5 * 1024 * 1024) === '5.0 MB'", () =>
  assert.equal(formatBytes(5 * 1024 * 1024), '5.0 MB'));
ok('formatNumber strips float noise: 0.1 + 0.2 → "0.3"', () =>
  assert.equal(formatNumber(0.1 + 0.2), '0.3'));
ok('formatNumber falls back to exponential for huge values', () =>
  assert.match(formatNumber(1e18), /e\+?18/i));
ok("baseName('photo.final.png') === 'photo.final'", () =>
  assert.equal(baseName('photo.final.png'), 'photo.final'));

console.log('\nPassword Generator');
ok('generated length is respected', () =>
  assert.equal(generatePassword(37, buildPool({ upper: true, lower: true, numbers: true, symbols: true })).length, 37));
ok('all characters come from the selected pool', () => {
  const pool = buildPool({ upper: true, numbers: true });
  const pw = generatePassword(200, pool);
  for (const ch of pw) assert.ok(pool.includes(ch), `unexpected char ${ch}`);
});
ok('each selected class appears in a 64-char password', () => {
  const pw = generatePassword(64, buildPool({ upper: true, lower: true, numbers: true, symbols: true }));
  assert.ok(/[A-Z]/.test(pw), 'missing uppercase');
  assert.ok(/[a-z]/.test(pw), 'missing lowercase');
  assert.ok(/[0-9]/.test(pw), 'missing number');
  assert.ok(/[!@#$%^&*()_+\-=[\]{};:,.<>?]/.test(pw), 'missing symbol');
});
ok('empty pool → empty password', () => assert.equal(generatePassword(16, buildPool({})), ''));
ok('length 0 → empty password', () =>
  assert.equal(generatePassword(0, buildPool({ lower: true })), ''));
ok('strength: 6 chars of a–z is Weak', () =>
  assert.equal(passwordStrength(6, 26).level, 1));
ok('strength: 8 chars of full pool (88) is Medium', () =>
  assert.equal(passwordStrength(8, 88).level, 2));
ok('strength: 20 chars of full pool (88) is Strong', () =>
  assert.equal(passwordStrength(20, 88).level, 3));
ok('strength with no pool is level 0', () =>
  assert.equal(passwordStrength(16, 0).level, 0));

console.log('\nPDF Merger (pdf-lib)');
await okAsync('merge two PDFs → page counts add up and result re-loads', async () => {
  async function makePdf(pages, text) {
    const doc = await PDFDocument.create();
    for (let i = 0; i < pages; i++) {
      const page = doc.addPage([300, 300]);
      page.drawText(`${text} p${i + 1}`, { x: 40, y: 150, size: 18 });
    }
    return doc.save();
  }
  const a = await PDFDocument.load(await makePdf(3, 'A'));
  const b = await PDFDocument.load(await makePdf(2, 'B'));
  assert.equal(a.getPageCount(), 3);
  assert.equal(b.getPageCount(), 2);

  // Same merge pattern as the UI component:
  const merged = await PDFDocument.create();
  let total = 0;
  for (const src of [a, b]) {
    const copied = await merged.copyPages(src, src.getPageIndices());
    copied.forEach((p) => merged.addPage(p));
    total += copied.length;
  }
  assert.equal(total, 5);
  assert.equal(merged.getPageCount(), 5);

  const bytes = await merged.save();
  assert.ok(bytes.length > 500, 'output bytes exist');
  const reloaded = await PDFDocument.load(bytes);
  assert.equal(reloaded.getPageCount(), 5);
});
await okAsync('corrupt PDF is rejected with an error (as in the UI)', async () => {
  await assert.rejects(PDFDocument.load(Buffer.from('not a pdf at all')));
});

console.log('\nQR Code Generator (qrcode)');
await okAsync('URL → PNG data URL', async () => {
  const url = await QRCode.toDataURL('https://example.com', { width: 512, margin: 2 });
  assert.ok(url.startsWith('data:image/png;base64,'), 'should be a PNG data URL');
});
await okAsync('unicode text works', async () => {
  const url = await QRCode.toDataURL('হ্যালো বিশ্ব! 🌍', { width: 256 });
  assert.ok(url.startsWith('data:image/png;base64,'));
});
await okAsync('oversized text is rejected (UI shows a friendly error)', async () => {
  await assert.rejects(QRCode.toDataURL('a'.repeat(4000)));
});

console.log('\nZIP download (JSZip)');
await okAsync('zip → contains all entries and round-trips', async () => {
  const zip = new JSZip();
  zip.file('a-compressed.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
  zip.file('b-compressed.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const blob = await zip.generateAsync({ type: 'nodebuffer' });
  const reopened = await JSZip.loadAsync(blob);
  assert.equal(Object.keys(reopened.files).length, 2);
  const first = await reopened.file('a-compressed.jpg').async('uint8array');
  assert.deepEqual([...first.slice(0, 4)], [0xff, 0xd8, 0xff, 0xe0]);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
