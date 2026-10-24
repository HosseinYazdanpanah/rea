import assert from 'node:assert/strict';
import { test } from 'node:test';
import { APPROVED_TOOLS, authorizeToolCall } from './security-policy.mjs';

test('all tools are denied by default', () => {
  assert.equal(APPROVED_TOOLS.size, 0);
  for (const name of ['process_run', 'read_file', 'browser_navigate', '__proto__']) {
    assert.deepEqual(authorizeToolCall({ name, arguments: {} }), {
      allowed: false,
      reason: 'tool_not_approved',
    });
  }
});

test('reject missing tool name and invalid arguments', () => {
  assert.equal(authorizeToolCall(null).allowed, false);
  assert.equal(authorizeToolCall({ name: '' }).allowed, false);
  assert.equal(authorizeToolCall({ name: 'x', arguments: [] }).allowed, false);
  assert.equal(authorizeToolCall({ name: 'x', arguments: null }).allowed, false);
});

test('an explicit policy must review both exact name and arguments', () => {
  const policies = new Map([['safe_inspect', {
    approved: true,
    authorizeArguments: (args) => Object.keys(args).length === 1 && args.artifactId === 'test-artifact',
  }]]);
  assert.equal(authorizeToolCall({ name: 'safe_inspect', arguments: { artifactId: 'test-artifact' } }, policies).allowed, true);
  assert.equal(authorizeToolCall({ name: 'safe_inspect', arguments: { artifactId: '../secret' } }, policies).allowed, false);
  assert.equal(authorizeToolCall({ name: 'safe_inspect ', arguments: { artifactId: 'test-artifact' } }, policies).allowed, false);
  assert.equal(authorizeToolCall({ name: 'safe_inspect', arguments: { artifactId: 'test-artifact', extra: true } }, policies).allowed, false);
});

test('unsafe or throwing policy validators fail closed', () => {
  assert.equal(authorizeToolCall({ name: 'x' }, new Map([['x', { approved: true }]])).allowed, false);
  assert.equal(authorizeToolCall({ name: 'x' }, new Map([['x', { approved: true, authorizeArguments: () => { throw Error('bad'); } }]])).allowed, false);
  assert.equal(authorizeToolCall({ name: 'x' }, new Map([['x', { approved: false, authorizeArguments: () => true }]])).allowed, false);
});
