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
  assert.equal(JSON.parse(healthy.body).mcp, 'disabled_pending_tool_sandbox');
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

test('even a forged bearer token and tool list request cannot expose MCP', async () => {
  const result = await request('/mcp', {
    method: 'POST',
    headers: { authorization: 'Bearer invalid', 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 'abc' }),
  });
  assert.equal(result.status, 503);
  assert.doesNotMatch(result.body, /tools["']?\\s*:/);
});

test('public health is read-only, no open CORS or session cookies', async () => {
  const post = await request('/healthz', { method: 'POST', body: 'some content' });
  assert.equal(post.status, 405);
  const home = await request('/');
  assert.equal(home.status, 200);
});

test('encoded and nested MCP paths do not expose the gateway', async () => {
  for (const path of ['/mcp/', '/mcp/tools', '/mcp?method=tools%2Flist', '/mcp/%2e%2e/secret']) {
    const result = await request(path);
    assert.ok([404, 503].includes(result.status));
  }
});
