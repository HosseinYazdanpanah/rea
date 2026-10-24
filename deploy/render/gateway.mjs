import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { readOAuthConfiguration, oauthResourceMetadata, oauthChallenge } from './oauth-config.mjs';

const REA_HOST = '127.0.0.1';
const REA_PORT = 8765;
const MAX_WAIT_MS = 700;

function response(res, code, value, type = 'application/json; charset=utf-8', headers = {}) {
  res.shouldKeepAlive = false;
  res.writeHead(code, {
    'content-type': type,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'content-security-policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    connection: 'close',
    ...headers,
  });
  res.end(value);
}

export function probeLoopback(port = REA_PORT) {
  return new Promise((resolveProbe) => {
    let settled = false;
    const socket = createConnection({ host: REA_HOST, port });
    const finish = (reachable) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolveProbe(reachable);
    };
    socket.setTimeout(MAX_WAIT_MS);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

export function createGatewayHandler({ engineProbe = probeLoopback, oauth = readOAuthConfiguration(), verifyToken } = {}) {
  return async (req, res) => {
    let pathname;
    try {
      pathname = new URL(req.url || '/', 'http://localhost').pathname;
    } catch {
      response(res, 400, JSON.stringify({ error: 'bad_request' }));
      return;
    }
    if (pathname === '/.well-known/oauth-protected-resource' || pathname === '/.well-known/oauth-protected-resource/mcp') {
      if (req.method !== 'GET') {
        response(res, 405, JSON.stringify({ error: 'method_not_allowed' }));
        return;
      }
      if (!oauth.enabled) {
        response(res, 503, JSON.stringify({ error: 'oauth_not_configured' }));
        return;
      }
      response(res, 200, JSON.stringify(oauthResourceMetadata(oauth)));
      return;
    }
    if (pathname === '/mcp' || pathname.startsWith('/mcp/')) {
      // OAuth is a prerequisite, never a grant to execute REA tools by itself.
      if (!oauth.enabled) {
        response(res, 503, JSON.stringify({ error: 'mcp_not_available', message: 'OAuth is not configured.' }));
        return;
      }
      if (typeof verifyToken !== 'function') {
        response(res, 503, JSON.stringify({ error: 'mcp_not_available', message: 'Token verification is unavailable.' }));
        return;
      }
      const auth = req.headers.authorization ?? '';
      const bearer = /^Bearer ([A-Za-z0-9._-]+)$/.exec(auth);
      if (!bearer || bearer[1].length > 12_000) {
        response(res, 401, JSON.stringify({ error: 'unauthorized' }), undefined, {
          'www-authenticate': oauthChallenge(oauth),
        });
        return;
      }
      let verified;
      try {
        verified = await verifyToken(bearer[1]);
      } catch {
        verified = { ok: false, reason: 'invalid_token' };
      }
      if (verified?.ok !== true) {
        const insufficient = verified?.reason === 'insufficient_scope' || verified?.reason === 'forbidden_user';
        response(res, insufficient ? 403 : 401, JSON.stringify({ error: insufficient ? 'forbidden' : 'unauthorized' }), undefined, {
          'www-authenticate': oauthChallenge(oauth, insufficient ? 'insufficient_scope' : 'invalid_token'),
        });
        return;
      }
      // Phase 3: even an authenticated and scoped caller cannot access REA yet.
      response(res, 503, JSON.stringify({
        error: 'mcp_not_available',
        message: 'Authenticated; upstream tools remain disabled until isolated proxy verification.',
      }));
      return;
    }
    if (req.method === 'GET' && pathname === '/healthz') {
      const engineListening = await engineProbe().catch(() => false);
      response(res, engineListening ? 200 : 503, JSON.stringify({
        gateway: 'online',
        engine: engineListening ? 'loopback_listener_detected' : 'unavailable',
        mcp: 'disabled_pending_tool_sandbox',
        oauth: oauth.enabled ? 'configured' : 'not_configured',
      }));
      return;
    }
    if (req.method === 'GET' && pathname === '/') {
      response(res, 200, '<!doctype html><html lang="en"><meta charset="utf-8"><title>REA Gateway</title><body><h1>REA Gateway</h1><p>Secure MCP access is not configured. Tools are not publicly available.</p></body></html>', 'text/html; charset=utf-8');
      return;
    }
    if (pathname === '/' || pathname === '/healthz') {
      response(res, 405, JSON.stringify({ error: 'method_not_allowed' }));
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
  rea.stderr.on('data', () => { /* Never return raw REA logs to unauthenticated clients. */ });
  rea.on('error', () => { /* Health remains unavailable on REA startup failure. */ });
  const oauth = readOAuthConfiguration();
  const tokenVerification = oauth.enabled
    ? import('./token-verifier.mjs').then(({ createBearerVerifier }) => createBearerVerifier(oauth)).catch(() => null)
    : Promise.resolve(null);
  const server = createServer({ maxHeaderSize: 8192 }, createGatewayHandler({
    oauth,
    verifyToken: async (token) => {
      const verifier = await tokenVerification;
      return verifier ? verifier(token) : { ok: false, reason: 'invalid_token' };
    },
  }));
  server.headersTimeout = 7_000;
  server.requestTimeout = 10_000;
  server.keepAliveTimeout = 4_000;
  server.maxRequestsPerSocket = 32;
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
