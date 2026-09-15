// Runs every MCP tool once against a running server, exactly the way a real MCP client would
// (Streamable HTTP transport, JSON-RPC over the wire). This is the acceptance test for the
// server itself — it proves the tools work end to end, not just that the code parses.
//
//   npm run verify                                  # http://localhost:3000/mcp
//   MCP_URL=https://toolshub-test-mcp.onrender.com/mcp npm run verify
//   npm run verify -- --only test_qr_generator      # one tool
//   npm run verify -- --repeat 3                    # repeat every tool (stability / leak check)
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? undefined : argv[i + 1];
};

const MCP_URL = flag('url') || process.env.MCP_URL || 'http://localhost:3000/mcp';
const ONLY = flag('only');
const REPEAT = Number(flag('repeat') || 1);
const VERBOSE = argv.includes('--verbose') || argv.includes('-v');

/** Sample arguments for each tool, mirroring the documented defaults. */
const CALLS = [
  { name: 'check_all_routes', args: {} },
  { name: 'test_image_compressor', args: { quality: 50 } },
  { name: 'test_pdf_merger', args: {} },
  { name: 'test_qr_generator', args: { text: 'https://example.com' } },
  { name: 'test_password_generator', args: { length: 16 } },
  { name: 'test_unit_converter', args: { category: 'Length', from_unit: 'km', to_unit: 'mi', value: 42 } },
  { name: 'test_unit_converter', args: { category: 'Temperature', from_unit: 'c', to_unit: 'f', value: -40 } },
  { name: 'test_unit_converter', args: { category: 'Weight', from_unit: 'kg', to_unit: 'lb', value: 70.5 } },
  { name: 'get_screenshot', args: { route: '/tools/qr-code-generator' } },
];

function textOf(result) {
  return (result?.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
}

function imageOf(result) {
  return (result?.content || []).find((c) => c.type === 'image') || null;
}

async function main() {
  console.log(`\nConnecting to ${MCP_URL}\n`);
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL));
  const client = new Client({ name: 'toolshub-test-mcp-verifier', version: '1.0.0' });
  await client.connect(transport);

  const { tools } = await client.listTools();
  console.log(`Server advertises ${tools.length} tools:`);
  for (const tool of tools) console.log(`  • ${tool.name}`);

  const calls = CALLS.filter((c) => !ONLY || c.name === ONLY);
  let passed = 0;
  let failed = 0;

  for (let round = 1; round <= REPEAT; round++) {
    if (REPEAT > 1) console.log(`\n${'='.repeat(70)}\nROUND ${round}/${REPEAT}\n${'='.repeat(70)}`);

    for (const call of calls) {
      const startedAt = Date.now();
      const label = `${call.name}${Object.keys(call.args).length ? ` ${JSON.stringify(call.args)}` : ''}`;
      try {
        const result = await client.callTool({ name: call.name, arguments: call.args });
        const ms = Date.now() - startedAt;
        const text = textOf(result);
        let payload = null;
        try {
          payload = JSON.parse(text);
        } catch {
          /* not JSON — print raw */
        }

        const body = payload?.result ?? payload;
        const verdict = body?.verdict ?? (payload?.ok === false ? 'error' : 'n/a');
        const okFlag = payload?.ok !== false && !String(verdict).startsWith('fail') && !result.isError;
        if (okFlag) passed++;
        else failed++;

        console.log(`\n${okFlag ? '✓' : '✗'} ${label}`);
        console.log(`   ${ms} ms · verdict: ${verdict}${result.isError ? ' · isError=true' : ''}`);

        if (body?.warnings?.length) {
          console.log(`   warnings:`);
          for (const w of body.warnings) console.log(`     - ${w}`);
        }
        if (payload?.ok === false) console.log(`   error: ${JSON.stringify(payload.error, null, 2)}`);

        const image = imageOf(result);
        if (image) {
          console.log(`   image: ${image.mimeType}, base64 length ${image.data.length}`);
        }

        // One compact line of the most interesting fields per tool.
        const highlights = {
          test_image_compressor: () =>
            `${body.originalSizeBytes} B → ${body.compressedSizeBytes} B (${body.savingsPercent}% saved) · download=${body.downloadWorked}`,
          test_pdf_merger: () =>
            `inputs ${body.inputPdfs?.map((i) => i.actualPageCount).join('+')} = ${body.measuredMergedPageCount} pages · download=${body.downloadSucceeded}`,
          test_qr_generator: () =>
            `rendered ${body.renderedSize?.width}×${body.renderedSize?.height}, natural ${body.intrinsicSize?.width}×${body.intrinsicSize?.height}, download=${body.downloadWorked} (${body.download?.bytes} B)`,
          test_password_generator: () =>
            `"${body.password}" len=${body.actualLength}/${body.requestedLength} strength=${body.strengthShownOnPage?.label} (expected ${body.expectedStrength?.label})`,
          test_unit_converter: () =>
            `${body.requested?.value} ${body.resolved?.from?.key} → page says ${body.shownOnPage?.resultNumber} ${body.resolved?.to?.key}, expected ${body.independentExpectation?.resultRounded} · matches=${body.matchesExpected}`,
          check_all_routes: () => `${body.ok}/${body.routesChecked} routes ok · ${body.headline}`,
          get_screenshot: () => `${body.route} HTTP ${body.httpStatus} · ${body.pngBytes} B · ${body.dimensions?.width}×${body.dimensions?.height}`,
        };
        if (highlights[call.name] && payload?.ok !== false) {
          try {
            console.log(`   → ${highlights[call.name]()}`);
          } catch {
            /* ignore */
          }
        }

        if (VERBOSE) console.log(text);
      } catch (err) {
        failed++;
        console.log(`\n✗ ${label}\n   THREW: ${err?.message?.split('\n')[0] || err}`);
      }
    }

    // Server-side health after the round: proves contexts are being closed (no leak).
    try {
      const healthUrl = MCP_URL.replace(/\/(mcp|sse)$/, '/health');
      const health = await (await fetch(healthUrl)).json();
      console.log(
        `\n/health → browserRunning=${health.browser?.browserRunning} contextsOpen=${health.browser?.contextsOpen} ` +
          `runs=${health.browser?.runs} failures=${health.browser?.failures} rss=${health.memory?.rssMb}MB`
      );
      if (health.browser?.contextsOpen > 0) {
        console.log('   ⚠ contexts still open — possible leak!');
        failed++;
      }
    } catch (err) {
      console.log(`\n/health check failed: ${err?.message?.split('\n')[0] || err}`);
    }
  }

  await client.close().catch(() => {});
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`${passed} passed · ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`\nVerifier failed: ${err?.message || err}`);
  process.exit(1);
});
