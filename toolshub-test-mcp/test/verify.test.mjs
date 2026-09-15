// Unit tests for the pure logic this MCP server uses to *independently* verify what the
// ToolsHub pages report. No browser, no network — run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CHAR_SETS,
  OPTION_KEYS,
  UNIT_CATEGORIES,
  clampInt,
  detectCharTypes,
  expectedConversion,
  normalizeCategory,
  normalizeOptions,
  numbersClose,
  parseByteSizeText,
  parseDisplayedNumber,
  parseMergeHeader,
  parsePageCount,
  pickArg,
  poolSizeFor,
  resolveUnit,
  strengthFor,
  verifyPassword,
} from '../src/verify.js';
import { dataUrlToBuffer, pngDimensions } from '../src/dom.js';
import { TOOLS, TOOL_DEFINITIONS, callTool, getTool } from '../src/tools/index.js';

const approx = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(b));

/* --------------------------------------------------------------- unit conversion */

test('unit converter: length conversions match the site\'s factor table', () => {
  assert.ok(approx(expectedConversion('length', 'km', 'mi', 1), 0.621371192237334));
  assert.ok(approx(expectedConversion('length', 'm', 'ft', 1), 3.2808398950131235));
  assert.ok(approx(expectedConversion('length', 'in', 'cm', 1), 2.54));
  assert.ok(approx(expectedConversion('length', 'm', 'ft', -5), -16.404199475065616));
  assert.ok(approx(expectedConversion('length', 'mi', 'km', 26.097590070919693), 42));
});

test('unit converter: weight conversions', () => {
  assert.ok(approx(expectedConversion('weight', 'kg', 'lb', 70.5), 155.4258947910297));
  assert.ok(approx(expectedConversion('weight', 'lb', 'kg', 1), 0.45359237));
  assert.ok(approx(expectedConversion('weight', 't', 'kg', 1), 1000));
  assert.ok(approx(expectedConversion('weight', 'oz', 'g', 1), 28.349523125));
});

test('unit converter: temperature goes through Celsius, not through factors', () => {
  assert.equal(expectedConversion('temperature', 'c', 'f', -40), -40);
  assert.ok(approx(expectedConversion('temperature', 'f', 'c', 212), 100));
  assert.ok(approx(expectedConversion('temperature', 'c', 'k', 0), 273.15));
  assert.ok(approx(expectedConversion('temperature', 'k', 'c', 300), 26.85));
  assert.ok(approx(expectedConversion('temperature', 'f', 'k', 32), 273.15));
});

test('resolveUnit accepts keys, labels, abbreviations and plurals', () => {
  assert.equal(resolveUnit('length', 'km').key, 'km');
  assert.equal(resolveUnit('length', 'KM').key, 'km');
  assert.equal(resolveUnit('length', 'Kilometer').key, 'km');
  assert.equal(resolveUnit('length', 'kilometers').key, 'km');
  assert.equal(resolveUnit('length', 'Kilometer (km)').key, 'km');
  assert.equal(resolveUnit('length', '(mi)').key, 'mi');
  assert.equal(resolveUnit('temperature', '°C').key, 'c');
  assert.equal(resolveUnit('temperature', 'Celsius').key, 'c');
  assert.equal(resolveUnit('weight', 'Pound (lb)').key, 'lb');
  assert.equal(resolveUnit('length', 'parsec'), null);
  assert.equal(resolveUnit('length', ''), null);
});

test('resolveUnit never lets a short key substring-match a longer unit', () => {
  // Regression: "(mi)" used to resolve to "Millimeter (mm)" because "millimeter" contains "mi".
  assert.equal(resolveUnit('length', 'm').key, 'm');
  assert.equal(resolveUnit('length', 'mm').key, 'mm');
  assert.equal(resolveUnit('length', 'mi').key, 'mi');
  assert.equal(resolveUnit('length', '(mi)').key, 'mi');
  assert.equal(resolveUnit('length', 'Mile').key, 'mi');
  assert.equal(resolveUnit('length', 'Miles').key, 'mi');
  assert.equal(resolveUnit('length', 'Millimeter').key, 'mm');
  assert.equal(resolveUnit('length', 'in').key, 'in');
  assert.equal(resolveUnit('length', 'Inch').key, 'in');
  assert.equal(resolveUnit('weight', 't').key, 't');
  assert.equal(resolveUnit('weight', 'Metric ton').key, 't');
  assert.equal(resolveUnit('weight', 'Stone').key, 'st');
  assert.equal(resolveUnit('temperature', 'k').key, 'k');
  assert.equal(resolveUnit('temperature', 'Kelvin').key, 'k');
});

test('normalizeCategory accepts the documented names and obvious aliases', () => {
  assert.equal(normalizeCategory('Length'), 'length');
  assert.equal(normalizeCategory('length'), 'length');
  assert.equal(normalizeCategory('TEMPERATURE'), 'temperature');
  assert.equal(normalizeCategory('temp'), 'temperature');
  assert.equal(normalizeCategory('mass'), 'weight');
  assert.equal(normalizeCategory('Volume'), null);
});

test('every category in the table is reachable from the UI labels', () => {
  for (const [key, category] of Object.entries(UNIT_CATEGORIES)) {
    assert.equal(normalizeCategory(category.label), key, `${category.label} should map to ${key}`);
    for (const unitKey of Object.keys(category.units)) {
      assert.equal(resolveUnit(key, unitKey).key, unitKey);
      assert.equal(resolveUnit(key, category.units[unitKey].label).key, unitKey);
    }
  }
});

test('parseDisplayedNumber handles grouping, negatives, exponentials and em-dashes', () => {
  assert.equal(parseDisplayedNumber('3.280839895'), 3.280839895);
  assert.equal(parseDisplayedNumber('1,609.344'), 1609.344);
  assert.equal(parseDisplayedNumber('-40'), -40);
  assert.equal(parseDisplayedNumber('1.234568e-10'), 1.234568e-10);
  assert.equal(parseDisplayedNumber('26.09759007 mi'), 26.09759007);
  assert.equal(parseDisplayedNumber('—'), null);
  assert.equal(parseDisplayedNumber(''), null);
  assert.equal(parseDisplayedNumber(null), null);
});

test('numbersClose tolerates the 10-significant-digit formatting the UI uses', () => {
  assert.ok(numbersClose(26.09759007, 26.097590070919693));
  assert.ok(!numbersClose(26.09, 26.097590070919693));
  assert.ok(!numbersClose(null, 1));
  assert.ok(numbersClose(0, 0));
});

/* --------------------------------------------------------------------- passwords */

test('verifyPassword checks length and character classes', () => {
  const options = normalizeOptions({});
  const result = verifyPassword({ password: 'aB3$aB3$aB3$aB3$', requestedLength: 16, options });
  assert.equal(result.actualLength, 16);
  assert.equal(result.lengthMatches, true);
  assert.deepEqual(result.detectedCharacterTypes, {
    uppercase: true,
    lowercase: true,
    numbers: true,
    symbols: true,
  });
  assert.deepEqual(result.unexpectedCharacterTypes, []);
  assert.equal(result.onlyRequestedCharactersUsed, true);
});

test('verifyPassword flags a wrong length and characters from disabled classes', () => {
  const options = normalizeOptions({ symbols: false, numbers: false });
  const result = verifyPassword({ password: 'abcDEF12', requestedLength: 16, options });
  assert.equal(result.lengthMatches, false);
  assert.deepEqual(result.unexpectedCharacterTypes.sort(), ['numbers']);
  assert.equal(result.onlyRequestedCharactersUsed, false);
  assert.equal(result.detectedCharacterTypes.symbols, false);
});

test('normalizeOptions defaults everything on and accepts aliases', () => {
  assert.deepEqual(normalizeOptions({}), { uppercase: true, lowercase: true, numbers: true, symbols: true });
  assert.equal(normalizeOptions({ upper: false }).uppercase, false);
  assert.equal(normalizeOptions({ digits: false }).numbers, false);
  assert.equal(normalizeOptions({ special: false }).symbols, false);
  assert.equal(normalizeOptions({ nonsense: false }).lowercase, true);
});

test('strength thresholds match the site (45 / 70 bits)', () => {
  const pool = poolSizeFor(normalizeOptions({})); // 26+26+10+25
  assert.equal(pool, 87);
  assert.equal(strengthFor(16, pool).label, 'Strong');
  assert.equal(strengthFor(8, pool).label, 'Medium');
  assert.equal(strengthFor(4, pool).label, 'Weak');
  assert.equal(strengthFor(16, 0).label, 'No characters selected');
  // 4 chars of a 4-char pool = 8 bits → Weak
  assert.equal(strengthFor(4, 4).label, 'Weak');
});

test('detectCharTypes uses exactly the site\'s character sets', () => {
  assert.deepEqual(detectCharTypes('abc'), { uppercase: false, lowercase: true, numbers: false, symbols: false });
  assert.deepEqual(detectCharTypes('123'), { uppercase: false, lowercase: false, numbers: true, symbols: false });
  assert.equal(detectCharTypes('!@#$%^&*()_+-=[]{};:,.<>?').symbols, true);
  assert.equal(CHAR_SETS.symbols.length, 25);
  assert.equal(OPTION_KEYS.length, 4);
});

/* ------------------------------------------------------------------ text parsing */

test('parseByteSizeText understands the site\'s formatBytes output', () => {
  assert.equal(parseByteSizeText('840 B'), 840);
  assert.equal(parseByteSizeText('2.1 KB'), 2150);
  assert.equal(parseByteSizeText('302.4 KB'), Math.round(302.4 * 1024));
  assert.equal(parseByteSizeText('1.5 MB'), Math.round(1.5 * 1024 * 1024));
  assert.equal(parseByteSizeText('no size here'), null);
});

test('parsePageCount reads "N page(s)" from a row', () => {
  assert.equal(parsePageCount('2.1 KB · 2 pages'), 2);
  assert.equal(parsePageCount('5 pages · 3.5 KB'), 5);
  assert.equal(parsePageCount('1 page'), 1);
  // The header line needs its own parser — "5 total pages" has a word in between.
  assert.equal(parsePageCount('2 valid files · 5 total pages to merge'), null);
  assert.deepEqual(parseMergeHeader('2 valid files · 5 total pages to merge'), { validFiles: 2, totalPages: 5 });
  assert.deepEqual(parseMergeHeader('1 valid file · 1 total page to merge'), { validFiles: 1, totalPages: 1 });
  assert.deepEqual(parseMergeHeader(null), { validFiles: null, totalPages: null });
});

test('clampInt and pickArg behave sensibly on junk input', () => {
  assert.equal(clampInt(50, 10, 100), 50);
  assert.equal(clampInt(500, 10, 100), 100);
  assert.equal(clampInt(-3, 10, 100), 10);
  assert.equal(clampInt('not-a-number', 10, 100, 50), 50);
  assert.equal(clampInt(20.7, 4, 64), 20);
  assert.equal(pickArg({ from_unit: 'km' }, 'from_unit', 'fromUnit'), 'km');
  assert.equal(pickArg({ fromUnit: 'mi' }, 'from_unit', 'fromUnit'), 'mi');
  assert.equal(pickArg({}, 'from_unit', 'fromUnit'), undefined);
});

/* ---------------------------------------------------------------- image helpers */

test('pngDimensions reads width/height out of the IHDR chunk', () => {
  const buffer = Buffer.alloc(24);
  buffer.writeUInt8(0x89, 0);
  buffer.write('PNG', 1);
  buffer[4] = 0x0d;
  buffer[5] = 0x0a;
  buffer[6] = 0x1a;
  buffer[7] = 0x0a;
  buffer.writeUInt32BE(1280, 16);
  buffer.writeUInt32BE(720, 20);
  assert.deepEqual(pngDimensions(buffer), { width: 1280, height: 720 });
  assert.equal(pngDimensions(Buffer.from('not a png at all not a png')), null);
  assert.equal(pngDimensions(null), null);
});

test('dataUrlToBuffer decodes base64 and plain data URLs', () => {
  const png = dataUrlToBuffer(`data:image/png;base64,${Buffer.from('hello').toString('base64')}`);
  assert.equal(png.mimeType, 'image/png');
  assert.equal(png.buffer.toString(), 'hello');
  const plain = dataUrlToBuffer('data:text/plain,hi%20there');
  assert.equal(plain.buffer.toString(), 'hi there');
  assert.equal(dataUrlToBuffer('https://example.com/x.png'), null);
});

/* ------------------------------------------------------------- tool definitions */

test('the registry exposes exactly the seven documented tools', () => {
  assert.deepEqual(
    TOOLS.map((t) => t.name).sort(),
    [
      'check_all_routes',
      'get_screenshot',
      'test_image_compressor',
      'test_password_generator',
      'test_pdf_merger',
      'test_qr_generator',
      'test_unit_converter',
    ].sort()
  );
  assert.equal(new Set(TOOLS.map((t) => t.name)).size, TOOLS.length);
});

test('every tool advertises a valid JSON Schema and a runnable handler', () => {
  for (const tool of TOOLS) {
    assert.ok(tool.description && tool.description.length > 40, `${tool.name} needs a real description`);
    assert.equal(tool.inputSchema.type, 'object', `${tool.name} schema must be an object`);
    assert.equal(tool.inputSchema.additionalProperties, false, `${tool.name} should reject unknown args`);
    assert.equal(typeof tool.run, 'function', `${tool.name} needs a run()`);
    for (const required of tool.inputSchema.required || []) {
      assert.ok(tool.inputSchema.properties[required], `${tool.name} requires an undeclared property ${required}`);
    }
    for (const [key, schema] of Object.entries(tool.inputSchema.properties)) {
      assert.ok(schema.type || schema.enum, `${tool.name}.${key} needs a type`);
      assert.ok(schema.description, `${tool.name}.${key} needs a description for the model`);
    }
  }
  // tools/list must not leak the run() functions.
  assert.ok(TOOL_DEFINITIONS.every((t) => t.run === undefined));
});

test('callTool rejects an unknown tool without touching the browser', async () => {
  const result = await callTool('nope_not_a_tool', {});
  assert.equal(result.isError, true);
  const payload = JSON.parse(result.content[0].text);
  assert.equal(payload.ok, false);
  assert.match(payload.error.message, /Unknown tool/);
  assert.equal(payload.error.availableTools.length, TOOLS.length);
  assert.equal(getTool('nope_not_a_tool'), null);
  assert.equal(getTool('test_qr_generator').name, 'test_qr_generator');
});
