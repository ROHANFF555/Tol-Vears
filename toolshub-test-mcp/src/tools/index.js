// Tool registry + the single place where a tool call is turned into an MCP result.
// Every tool is executed through the shared BrowserManager, so it always gets a fresh context
// that is closed afterwards, and every failure is converted into a readable error payload
// instead of an exception that could take the server down.
import { browserManager } from '../browser.js';
import { CONFIG } from '../config.js';
import { describeError } from '../diagnostics.js';
import { imageCompressorTool } from './imageCompressor.js';
import { pdfMergerTool } from './pdfMerger.js';
import { qrGeneratorTool } from './qrGenerator.js';
import { passwordGeneratorTool } from './passwordGenerator.js';
import { unitConverterTool } from './unitConverter.js';
import { checkAllRoutesTool } from './checkAllRoutes.js';
import { screenshotTool } from './screenshot.js';

export const TOOLS = [
  imageCompressorTool,
  pdfMergerTool,
  qrGeneratorTool,
  passwordGeneratorTool,
  unitConverterTool,
  checkAllRoutesTool,
  screenshotTool,
];

/** Tool list as advertised by tools/list. */
export const TOOL_DEFINITIONS = TOOLS.map(({ name, title, description, inputSchema }) => ({
  name,
  title,
  description,
  inputSchema,
}));

export function getTool(name) {
  return TOOLS.find((t) => t.name === name) || null;
}

/**
 * Run one tool and wrap the outcome in an MCP CallToolResult.
 * Never throws — a failed test is still a well-formed result with isError: true.
 */
export async function callTool(name, args = {}) {
  const tool = getTool(name);
  const startedAt = Date.now();

  if (!tool) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              ok: false,
              tool: name,
              error: {
                name: 'UnknownToolError',
                message: `Unknown tool "${name}".`,
                availableTools: TOOLS.map((t) => t.name),
              },
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }

  try {
    const result = await browserManager.run(name, (session) => tool.run(session, args ?? {}));
    const envelope = {
      ok: true,
      tool: name,
      baseUrl: CONFIG.baseUrl,
      startedAt: new Date(startedAt).toISOString(),
      durationMs: Date.now() - startedAt,
    };
    const content = tool.renderContent
      ? tool.renderContent(envelope, result)
      : [{ type: 'text', text: JSON.stringify({ ...envelope, result }, null, 2) }];
    return { content, isError: false };
  } catch (err) {
    const payload = {
      ok: false,
      tool: name,
      baseUrl: CONFIG.baseUrl,
      startedAt: new Date(startedAt).toISOString(),
      durationMs: Date.now() - startedAt,
      error: describeError(err, { toolName: name, baseUrl: CONFIG.baseUrl }),
      browser: browserManager.snapshot(),
    };
    if (err && typeof err === 'object' && err.diagnostics) payload.diagnostics = err.diagnostics;
    return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }], isError: true };
  }
}
