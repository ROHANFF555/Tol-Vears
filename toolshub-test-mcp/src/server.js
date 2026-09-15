// ToolsHub Testing MCP Server
//
// Exposes seven browser-driven test tools over HTTP so a remote MCP client (Claude's connector
// UI, Cursor, …) can connect by URL:
//
//   POST/GET/DELETE  /mcp        Streamable HTTP transport (the modern one — use this)
//   GET              /sse        Legacy HTTP+SSE transport, POST /messages?sessionId=…
//   GET              /health     Liveness/readiness probe (used by Render)
//   GET              /           Human-readable index of what this server offers
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { CallToolRequestSchema, ListToolsRequestSchema, isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';

import { CONFIG, ROOT } from './config.js';
import { browserManager } from './browser.js';
import { TOOL_DEFINITIONS, callTool } from './tools/index.js';

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const VERSION = pkg.version || '1.0.0';
const SERVER_INFO = { name: 'toolshub-test-mcp', version: VERSION };

const log = (...args) => console.log(new Date().toISOString(), ...args);

/* --------------------------------------------------------------- MCP server */

function createMcpServer() {
  const server = new Server(SERVER_INFO, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOL_DEFINITIONS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const startedAt = Date.now();
    log(`→ tool ${name}`, args ? JSON.stringify(args).slice(0, 200) : '');
    const result = await callTool(name, args);
    log(`← tool ${name} ${result.isError ? 'FAILED' : 'ok'} in ${Date.now() - startedAt} ms`);
    return result;
  });

  return server;
}

/* ------------------------------------------------------------------ express */

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '4mb' }));

/** sessionId → { transport, server, lastSeen } for the Streamable HTTP transport. */
const sessions = new Map();
/** sessionId → { transport, server, lastSeen } for the legacy SSE transport. */
const sseSessions = new Map();

// Some clients disconnect without sending DELETE /mcp, which would otherwise leave a transport
// (and its Server instance) in the map forever. Sweep anything idle for longer than the TTL.
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS || 30 * 60_000);
const SESSION_SWEEP_INTERVAL_MS = Number(process.env.SESSION_SWEEP_INTERVAL_MS || 60_000);
const touch = (map, id) => {
  const entry = map.get(id);
  if (entry) entry.lastSeen = Date.now();
  return entry?.transport;
};

const sessionSweeper = setInterval(() => {
  const now = Date.now();
  for (const [map, label] of [
    [sessions, 'streamable-http'],
    [sseSessions, 'legacy-sse'],
  ]) {
    for (const [id, entry] of map) {
      if (now - entry.lastSeen > SESSION_TTL_MS) {
        log(`expiring idle ${label} session ${id} (${Math.round((now - entry.lastSeen) / 1000)}s idle)`);
        map.delete(id);
        Promise.resolve(entry.transport.close?.()).catch(() => {});
      }
    }
  }
}, SESSION_SWEEP_INTERVAL_MS);
sessionSweeper.unref?.();

app.post('/mcp', async (req, res) => {
  try {
    const headerSession = req.headers['mcp-session-id'];
    const sessionId = Array.isArray(headerSession) ? headerSession[0] : headerSession;
    let transport = sessionId ? touch(sessions, sessionId) : undefined;

    if (!transport) {
      if (sessionId) {
        res.status(404).json({
          jsonrpc: '2.0',
          error: { code: -32001, message: 'Session not found — it may have expired. Re-initialize.' },
          id: null,
        });
        return;
      }
      if (!isInitializeRequest(req.body)) {
        res.status(400).json({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Bad Request: not an initialize request and no session id given.' },
          id: null,
        });
        return;
      }

      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          sessions.set(id, { transport, server, lastSeen: Date.now() });
          log(`session initialized ${id} (${sessions.size} active)`);
        },
        onsessionclosed: (id) => {
          sessions.delete(id);
          log(`session closed ${id} (${sessions.size} active)`);
        },
      });

      transport.onclose = () => {
        if (transport.sessionId) sessions.delete(transport.sessionId);
      };

      // onsessioninitialized (fired while handling the initialize request below) registers this
      // session in `sessions`; transport.onclose removes it again.
      const server = createMcpServer();
      await server.connect(transport);
    }

    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    log('POST /mcp error:', err?.message || err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      });
    }
  }
});

async function handleSessionRequest(req, res) {
  const headerSession = req.headers['mcp-session-id'];
  const sessionId = Array.isArray(headerSession) ? headerSession[0] : headerSession;
  const transport = sessionId ? touch(sessions, sessionId) : undefined;
  if (!transport) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }
  try {
    await transport.handleRequest(req, res);
  } catch (err) {
    log(`${req.method} /mcp error:`, err?.message || err);
    if (!res.headersSent) res.status(500).send('Internal server error');
  }
}

app.get('/mcp', handleSessionRequest);
app.delete('/mcp', handleSessionRequest);

/* ------------------------------------------------- legacy HTTP+SSE transport */

app.get('/sse', async (req, res) => {
  try {
    const transport = new SSEServerTransport('/messages', res);
    const server = createMcpServer();
    sseSessions.set(transport.sessionId, { transport, server, lastSeen: Date.now() });
    res.on('close', () => {
      sseSessions.delete(transport.sessionId);
      log(`sse session closed ${transport.sessionId}`);
    });
    await server.connect(transport);
    log(`sse session opened ${transport.sessionId}`);
  } catch (err) {
    log('GET /sse error:', err?.message || err);
    if (!res.headersSent) res.status(500).send('Internal server error');
  }
});

app.post('/messages', async (req, res) => {
  const sessionId = req.query.sessionId;
  const transport = touch(sseSessions, sessionId);
  if (!transport) {
    res.status(400).send('Unknown or expired session');
    return;
  }
  try {
    await transport.handlePostMessage(req, res, req.body);
  } catch (err) {
    log('POST /messages error:', err?.message || err);
    if (!res.headersSent) res.status(500).send('Internal server error');
  }
});

/* ------------------------------------------------------------ introspection */

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    server: SERVER_INFO,
    uptimeSeconds: Math.round(process.uptime()),
    targetSite: CONFIG.baseUrl,
    browser: browserManager.snapshot(),
    activeSessions: {
      streamableHttp: sessions.size,
      legacySse: sseSessions.size,
      ttlMinutes: Math.round(SESSION_TTL_MS / 60_000),
    },
    memory: { rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024) },
    tools: TOOL_DEFINITIONS.map((t) => t.name),
  });
});

app.get('/', (req, res) => {
  res.type('html').send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ToolsHub Testing MCP Server</title>
<style>body{font:16px/1.6 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:46rem;margin:3rem auto;padding:0 1.25rem;color:#0f172a}
code{background:#f1f5f9;padding:.15em .4em;border-radius:.35em;font-size:.9em}
h1{font-size:1.7rem;letter-spacing:-.02em}table{border-collapse:collapse;width:100%;font-size:.95rem}
td,th{text-align:left;padding:.4rem .6rem;border-bottom:1px solid #e2e8f0;vertical-align:top}
.badge{display:inline-block;background:#eef2ff;color:#4338ca;border-radius:999px;padding:.15rem .6rem;font-size:.8rem;font-weight:600}</style></head>
<body>
<h1>ToolsHub Testing MCP Server <span class="badge">v${VERSION}</span></h1>
<p>This service lets an AI client test the live <strong>ToolsHub</strong> site
(<code>${CONFIG.baseUrl}</code>) by driving a real headless Chromium browser — clicking buttons,
uploading files, downloading results and taking screenshots.</p>
<h2>Connect</h2>
<table>
<tr><th>Transport</th><th>URL</th></tr>
<tr><td>Streamable HTTP <em>(recommended)</em></td><td><code>${req.headers.origin || `${req.protocol}://${req.get('host')}`}/mcp</code></td></tr>
<tr><td>Legacy HTTP+SSE</td><td><code>${req.headers.origin || `${req.protocol}://${req.get('host')}`}/sse</code></td></tr>
<tr><td>Health probe</td><td><code>/health</code></td></tr>
</table>
<h2>Tools</h2>
<table><tr><th>Name</th><th>What it does</th></tr>
${TOOL_DEFINITIONS.map((t) => `<tr><td><code>${t.name}</code></td><td>${t.description.replace(/</g, '&lt;')}</td></tr>`).join('\n')}
</table>
</body></html>`);
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not found', endpoints: ['/mcp', '/sse', '/messages', '/health', '/'] });
});

/* ------------------------------------------------------------------ startup */

const server = app.listen(CONFIG.port, CONFIG.host, () => {
  log(`${SERVER_INFO.name} v${VERSION} listening on http://${CONFIG.host}:${CONFIG.port}`);
  log(`  MCP endpoint (streamable HTTP): http://${CONFIG.host}:${CONFIG.port}/mcp`);
  log(`  MCP endpoint (legacy SSE):      http://${CONFIG.host}:${CONFIG.port}/sse`);
  log(`  Testing target site:            ${CONFIG.baseUrl}`);
  log(
    `  Chromium: ${
      CONFIG.chromiumExecutablePath ? CONFIG.chromiumExecutablePath : 'Playwright-managed browser'
    }`
  );
});

// Render sends SIGTERM on deploy/shutdown; make sure Chromium does not linger.
async function shutdown(signal) {
  log(`${signal} received — shutting down`);
  clearInterval(sessionSweeper);
  for (const map of [sessions, sseSessions]) {
    for (const [id, entry] of map) {
      map.delete(id);
      await Promise.resolve(entry.transport.close?.()).catch(() => {});
    }
  }
  try {
    await browserManager.close('shutdown');
  } catch {
    /* ignore */
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 8000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => log('unhandledRejection:', reason?.message || reason));
process.on('uncaughtException', (err) => log('uncaughtException:', err?.message || err));

export { app, server };
