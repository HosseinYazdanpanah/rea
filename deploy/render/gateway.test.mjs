import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { createGatewayHandler } from './gateway.mjs';

async function request(path, options = {}, reachable = true) {
  const server = createServer(createGatewayHandler({ engineProbe: async () => reachable }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, options);
    return { status: response.status, body: await response.text() };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('MCP is always inaccessible without verified OAuth, including tools calls', async () => {
  for (const options of [
    {},
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'dangerous' } }) },
    { method: 'DELETE' },
  ]) {
    const result = await request('/mcp', options);
    assert.equal(result.status, 503);
    assert.match(result.body, /disabled_pending_auth|mcp_not_available/);
  }
});

test('health reports local engine readiness and disabled MCP separately', async () => {
  const healthy = await request('/healthz', {}, true);
  assert.equal(healthy.status, 200);
  assert.equal(JSON.parse(healthy.body).mcp, 'disabled_pending_auth');
  const unhealthy = await request('/healthz', {}, false);
  assert.equal(unhealthy.status, 503);
});

test('home page never suggests that MCP is already enabled', async () => {
  const result = await request('/');
  assert.equal(result.status, 200);
  assert.match(result.body, /not configured/);
});

test('unknown routes are denied', async () => {
  const result = await request('/secret');
  assert.equal(result.status, 404);
});
