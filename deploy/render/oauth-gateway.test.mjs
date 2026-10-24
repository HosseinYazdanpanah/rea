import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { createGatewayHandler } from './gateway.mjs';
import { readOAuthConfiguration } from './oauth-config.mjs';

const config = readOAuthConfiguration({
  REA_PUBLIC_URL: 'https://rea.example.com',
  AUTH0_ISSUER: 'https://login.example.com',
  AUTH0_AUDIENCE: 'https://rea.example.com',
  AUTH0_ALLOWED_SUBJECTS: 'auth0|owner',
});

async function call(path, options = {}, { oauth = config, verifyToken } = {}) {
  const server = createServer(createGatewayHandler({ oauth, verifyToken, engineProbe: async () => true }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    return await fetch(`http://127.0.0.1:${server.address().port}${path}`, options);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('unauthenticated calls get standards-compliant discovery challenge', async () => {
  const res = await call('/mcp', {}, { verifyToken: async () => { throw Error('must not be called'); } });
  assert.equal(res.status, 401);
  assert.match(res.headers.get('www-authenticate'), /resource_metadata=/);
  const metadata = await (await call('/.well-known/oauth-protected-resource')).json();
  assert.equal(metadata.resource, 'https://rea.example.com');
});

test('invalid tokens are denied, insufficient scopes and unauthorized users forbidden', async () => {
  for (const [reason, expected] of [['invalid_token', 401], ['insufficient_scope', 403], ['forbidden_user', 403]]) {
    const res = await call('/mcp', { headers: { authorization: 'Bearer fake.token.payload' } }, {
      verifyToken: async () => ({ ok: false, reason }),
    });
    assert.equal(res.status, expected);
  }
});

test('authenticated caller remains blocked until actual REA sandbox gate', async () => {
  const res = await call('/mcp', { headers: { authorization: 'Bearer fake.token.payload' } }, {
    verifyToken: async () => ({ ok: true, subject: 'auth0|owner', scope: ['rea:inspect'] }),
  });
  assert.equal(res.status, 503);
  assert.match(await res.text(), /upstream tools remain disabled/);
});

test('disabled configuration never exposes metadata or resource', async () => {
  const disabled = { enabled: false };
  assert.equal((await call('/mcp', {}, { oauth: disabled })).status, 503);
  assert.equal((await call('/.well-known/oauth-protected-resource', {}, { oauth: disabled })).status, 503);
});
