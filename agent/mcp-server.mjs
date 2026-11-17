#!/usr/bin/env node
/* ===== agent/mcp-server.mjs =====
   Zero-dependency MCP stdio server for the Ramanujan's Compassion agent
   toolset (docs/AGENT-INTERFACE.md section 9).

   Transport: newline-delimited JSON-RPC 2.0 on stdin/stdout.
   STDOUT CARRIES PROTOCOL MESSAGES ONLY — never diagnostics, never banners.
   All logging goes to stderr.

   Methods: initialize, notifications/initialized (silent), ping, tools/list,
   tools/call. Parse error -32700, invalid request -32600, unknown request
   method -32601, invalid params -32602, internal -32603.
   Clean EOF exits 0.

   Tool results always come from the ONE shared core (js/agent-core.js:
   AgentCore.callTool), so the MCP envelope is byte-identical to the CLI's.
*/
import { createRequire } from 'node:module';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const PROTOCOL_VERSION = '2025-06-18';
const SERVER_NAME = 'ramanujan-sphere';
const SERVER_VERSION = '1.0.0';
const SCHEMA_VERSION = 1;

const requireShared = createRequire(import.meta.url);

/* ------------------------------------------------------------------ */
/* Shared core loader                                                 */
/* ------------------------------------------------------------------ */

function loadCore() {
  try {
    requireShared(path.join(ROOT, 'js', 'engine.js'));
    requireShared(path.join(ROOT, 'js', 'presets.js'));
  } catch (err) {
    throw new Error('could not load js/engine.js or js/presets.js: ' + err.message);
  }
  let mod;
  try {
    mod = requireShared(path.join(ROOT, 'js', 'agent-core.js'));
  } catch (err) {
    throw new Error('could not load js/agent-core.js: ' + err.message);
  }
  const core = mod && mod.AgentCore ? mod.AgentCore : mod;
  if (!core || typeof core.callTool !== 'function') {
    throw new Error('js/agent-core.js does not export the AgentCore surface (callTool missing)');
  }
  return core;
}

let core;
try {
  core = loadCore();
} catch (err) {
  process.stderr.write('ramanujan-sphere MCP server: ' + err.message + '\n');
  process.exit(1);
}

/* ------------------------------------------------------------------ */
/* JSON-RPC plumbing                                                  */
/* ------------------------------------------------------------------ */

function ok(id, result) {
  return { jsonrpc: '2.0', id: id, result: result };
}

function rpcError(id, code, message, data) {
  const error = { code: code, message: message };
  if (data !== undefined) error.data = data;
  return { jsonrpc: '2.0', id: id, error: error };
}

function internalToolEnvelope(tool, err) {
  const message = err && err.message ? String(err.message) : String(err);
  return {
    ok: false,
    schemaVersion: (core && core.SCHEMA_VERSION) || SCHEMA_VERSION,
    tool: tool,
    error: {
      code: 'E_INTERNAL',
      message: message.slice(0, 300),
      hint: 'The shared core failed unexpectedly; verify js/agent-core.js loads in Node.'
    },
    warnings: []
  };
}

/* ------------------------------------------------------------------ */
/* Tools                                                              */
/* ------------------------------------------------------------------ */

/** Canonical ToolDefs (without run), in registry order. */
function toolDefinitions() {
  let defs = [];
  if (Array.isArray(core.TOOLS)) {
    defs = core.TOOLS;
  } else if (core.TOOLS && typeof core.TOOLS === 'object' && Array.isArray(core.TOOL_NAMES)) {
    defs = core.TOOL_NAMES.map(function (name) { return core.TOOLS[name]; });
  }
  if (defs.length === 0) {
    try {
      const manifest = core.getManifest();
      if (manifest && Array.isArray(manifest.tools)) defs = manifest.tools;
    } catch (err) { /* leave empty: tools/list still returns a valid array */ }
  }
  return defs.filter(function (def) { return def && typeof def.name === 'string'; });
}

/** MCP tools/list entries: exactly name, description, inputSchema. */
function toolListEntries() {
  return toolDefinitions().map(function (def) {
    return {
      name: def.name,
      description: typeof def.description === 'string' ? def.description : '',
      inputSchema: def.inputSchema && typeof def.inputSchema === 'object'
        ? def.inputSchema
        : { type: 'object', properties: {} }
    };
  });
}

function handleToolsCall(id, params) {
  if (params === null || typeof params !== 'object' || Array.isArray(params)) {
    return rpcError(id, -32602, 'Invalid params: tools/call requires an object');
  }
  if (typeof params.name !== 'string' || params.name === '') {
    return rpcError(id, -32602, 'Invalid params: tools/call requires a tool name');
  }
  let args = params.arguments;
  if (args === undefined || args === null) args = {};
  if (typeof args !== 'object' || Array.isArray(args)) {
    return rpcError(id, -32602, 'Invalid params: tools/call arguments must be an object');
  }

  let envelope;
  try {
    envelope = core.callTool(params.name, args);
  } catch (err) {
    envelope = internalToolEnvelope(params.name, err);
  }
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
    envelope = internalToolEnvelope(params.name, new Error('shared core returned no tool envelope'));
  }

  return ok(id, {
    content: [{ type: 'text', text: JSON.stringify(envelope, null, 2) }],
    isError: envelope.ok !== true
  });
}

/* ------------------------------------------------------------------ */
/* Message handling                                                   */
/* ------------------------------------------------------------------ */

function handleLine(text) {
  let message;
  try {
    message = JSON.parse(text);
  } catch (err) {
    return rpcError(null, -32700, 'Parse error');
  }
  return handleMessage(message);
}

function handleMessage(message) {
  if (Array.isArray(message)) {
    return rpcError(null, -32600, 'Invalid Request: batched messages are not supported');
  }
  if (message === null || typeof message !== 'object') {
    return rpcError(null, -32600, 'Invalid Request: expected a JSON object');
  }

  // Notifications (no "id" member) are always silent — MCP sends
  // notifications/initialized this way, and JSON-RPC forbids replying.
  if (!Object.prototype.hasOwnProperty.call(message, 'id')) return null;

  const id = message.id;
  if (!(id === null || typeof id === 'string' || typeof id === 'number')) {
    return rpcError(null, -32600, 'Invalid Request: id must be a string, number or null');
  }
  if (message.jsonrpc !== '2.0') {
    return rpcError(id, -32600, 'Invalid Request: jsonrpc must be "2.0"');
  }
  if (typeof message.method !== 'string' || message.method === '') {
    return rpcError(id, -32600, 'Invalid Request: method must be a string');
  }

  switch (message.method) {
    case 'initialize':
      return ok(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION }
      });
    case 'ping':
      return ok(id, {});
    case 'tools/list':
      return ok(id, { tools: toolListEntries() });
    case 'tools/call':
      return handleToolsCall(id, message.params);
    default:
      return rpcError(id, -32601, 'Method not found: ' + message.method);
  }
}

/* ------------------------------------------------------------------ */
/* stdio loop                                                         */
/* ------------------------------------------------------------------ */

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
  terminal: false
});

rl.on('line', function (line) {
  const text = line.trim();
  if (text === '') return;
  let response;
  try {
    response = handleLine(text);
  } catch (err) {
    response = rpcError(null, -32603, 'Internal error');
  }
  if (response) process.stdout.write(JSON.stringify(response) + '\n');
});

rl.on('close', function () {
  // Clean EOF: no protocol chatter, exit 0.
  process.exitCode = 0;
});
