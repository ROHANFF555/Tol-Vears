// Failure-path matrix: proves the requirement that "every tool must catch navigation/timeout
// errors and return a clear error message rather than crashing the server".
//
//   npm run verify:errors                        # against http://localhost:3000/mcp
//   MCP_URL=https://toolshub-test-mcp.onrender.com/mcp npm run verify:errors
//
// Each case declares what a *good* failure looks like; the script fails if the server crashes,
// hangs, or returns an unhelpful message.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const argv = process.argv.slice(2);
const MCP_URL =
  argv.find((a) => a.startsWith('--url='))?.slice(6) || process.env.MCP_URL || 'http://localhost:3000/mcp';

const HUGE_TEXT = 'https://example.com/'.repeat(400); // ~8000 chars — far beyond a single QR code

/** expect: 'error' = ok:false with isError, 'graceful' = ok:true but reporting the problem. */
const CASES = [
  {
    name: 'unit converter rejects an unknown category',
    tool: 'test_unit_converter',
    args: { category: 'Volume', from_unit: 'litre', to_unit: 'gallon', value: 5 },
    expect: 'error',
    mustInclude: /Valid categories/i,
  },
  {
    name: 'unit converter rejects an unknown unit',
    tool: 'test_unit_converter',
    args: { category: 'Length', from_unit: 'parsec', to_unit: 'mi', value: 5 },
    expect: 'error',
    mustInclude: /Valid units/i,
  },
  {
    name: 'unit converter rejects a non-numeric value',
    tool: 'test_unit_converter',
    args: { category: 'Length', from_unit: 'km', to_unit: 'mi', value: 'banana' },
    expect: 'error',
    mustInclude: /finite number/i,
  },
  {
    name: 'password generator with every character type disabled',
    tool: 'test_password_generator',
    args: { length: 20, options: { uppercase: false, lowercase: false, numbers: false, symbols: false } },
    expect: 'graceful',
    mustInclude: /character type/i,
  },
  {
    name: 'QR generator with text too long for one code',
    tool: 'test_qr_generator',
    args: { text: HUGE_TEXT },
    expect: 'graceful',
    mustInclude: /qrImageAppeared|too long/i,
  },
  {
    name: 'screenshot of a route that does not exist (app 404 page)',
    tool: 'get_screenshot',
    args: { route: '/definitely-not-a-real-route' },
    expect: 'graceful',
    mustInclude: /Page not found|404/i,
  },
  {
    name: 'image compressor with a nonsensical quality falls back to the default',
    tool: 'test_image_compressor',
    args: { quality: 'not-a-number' },
    expect: 'graceful',
    mustInclude: /compressedSizeBytes/i,
  },
  {
    name: 'unknown tool name',
    tool: 'this_tool_does_not_exist',
    args: {},
    expect: 'error',
    mustInclude: /availableTools|Unknown tool/i,
  },
];

function textOf(result) {
  return (result?.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
}

async function main() {
  console.log(`\nFailure-path matrix against ${MCP_URL}\n`);
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL));
  const client = new Client({ name: 'toolshub-test-mcp-error-verifier', version: '1.0.0' });
  await client.connect(transport);

  let passed = 0;
  let failed = 0;

  for (const testCase of CASES) {
    const startedAt = Date.now();
    try {
      const result = await client.callTool({ name: testCase.tool, arguments: testCase.args });
      const ms = Date.now() - startedAt;
      const text = textOf(result);
      const payload = JSON.parse(text);
      const errored = payload.ok === false || result.isError === true;

      const rightShape = testCase.expect === 'error' ? errored : !errored;
      const hasHint = testCase.mustInclude ? testCase.mustInclude.test(text) : true;
      const notTooSlow = ms < 45_000;
      const ok = rightShape && hasHint && notTooSlow;

      if (ok) passed++;
      else failed++;

      const detail = payload.ok === false ? payload.error?.message : payload.result?.verdict || payload.result?.warnings?.[0];
      console.log(`${ok ? '✓' : '✗'} ${testCase.name}`);
      console.log(`   ${ms} ms · expected=${testCase.expect} got=${errored ? 'error' : 'graceful'}`);
      console.log(`   → ${String(detail || '').slice(0, 190)}`);
      if (!hasHint) console.log(`   ⚠ response did not match ${testCase.mustInclude}`);
      if (!notTooSlow) console.log('   ⚠ took too long — a hung page is blocking the server');
    } catch (err) {
      failed++;
      console.log(`✗ ${testCase.name}\n   THREW OUT OF THE SERVER: ${String(err?.message || err).split('\n')[0]}`);
    }
  }

  // The server must still be healthy after all that abuse.
  const health = await (await fetch(MCP_URL.replace(/\/(mcp|sse)$/, '/health'))).json();
  const healthy = health.status === 'ok' && health.browser.contextsOpen === 0;
  if (healthy) passed++;
  else failed++;
  console.log(`\n${healthy ? '✓' : '✗'} server still healthy afterwards`);
  console.log(
    `   uptime=${health.uptimeSeconds}s runs=${health.browser.runs} failures=${health.browser.failures} ` +
      `contextsOpen=${health.browser.contextsOpen} rss=${health.memory.rssMb}MB`
  );

  await client.close().catch(() => {});
  console.log(`\n${'─'.repeat(70)}\n${passed} passed · ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`\nError verifier failed: ${err?.message || err}`);
  process.exit(1);
});
