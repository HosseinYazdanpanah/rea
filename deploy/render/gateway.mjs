import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const REA_HOST = '127.0.0.1';
const REA_PORT = 8765;
const MAX_WAIT_MS = 700;

function response(res, code, value, type = 'application/json; charset=utf-8') {
  res.writeHead(code, {
    'content-type': type,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  });
  res.end(value);
}

export function probeLoopback(port = REA_PORT) {
  return new Promise((resolveProbe) => {
    let settled = false;
    const finish = (reachable) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolveProbe(reachable);
    };
    const socket = createConnection({ host: REA_HOST, port });
    socket.setTimeout(MAX_WAIT_MS);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

export function createGatewayHandler({ engineProbe = probeLoopback } = {}) {
  return async (req, res) => {
    const pathname = new URL(req.url || '/', 'http://localhost').pathname;
    if (pathname === '/mcp' || pathname.startsWith('/mcp/')) {
      // A gateway without verified OAuth MUST NOT forward a REA request.
      response(res, 503, JSON.stringify({
        error: 'mcp_not_available',
        message: 'MCP is disabled until OAuth and tool authorization are verified.',
      }));
      return;
    }
    if (req.method === 'GET' && pathname === '/healthz') {
      const engineListening = await engineProbe().catch(() => false);
      response(res, engineListening ? 200 : 503, JSON.stringify({
        gateway: 'online',
        engine: engineListening ? 'loopback_listener_detected' : 'unavailable',
        mcp: 'disabled_pending_auth',
      }));
      return;
    }
    if (req.method === 'GET' && pathname === '/') {
      response(res, 200, '<!doctype html><html lang="en"><meta charset="utf-8"><title>REA Gateway</title><body><h1>REA Gateway</h1><p>Secure MCP access is not configured. Tools are not publicly available.</p></body></html>', 'text/html; charset=utf-8');
      return;
    }
    response(res, 404, JSON.stringify({ error: 'not_found' }));
  };
}

export function boot() {
  const port = Number(process.env.PORT ?? '10000');
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Invalid PORT; expected 1-65535.');
  }
  const rea = spawn('rea', ['mcp', '--http', '--host', REA_HOST, '--port', String(REA_PORT)], {
    stdio: ['ignore', 'ignore', 'pipe'],
    env: { ...process.env, REA_LOG_LEVEL: 'silent' },
  });
  rea.stderr.on('data', () => { /* Do not echo diagnostic details publicly. */ });
  rea.on('error', () => { /* Health remains unavailable on startup failure. */ });
  const server = createServer(createGatewayHandler());
  server.listen(port, '0.0.0.0', () => {
    process.stdout.write(`Gateway listening on port ${port}; MCP disabled pending OAuth.\n`);
  });
  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    server.close();
    if (rea.exitCode === null) rea.kill('SIGTERM');
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

const direct = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direct) boot();
