import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readOAuthConfiguration, oauthChallenge, oauthResourceMetadata } from './oauth-config.mjs';

const valid = {
  REA_PUBLIC_URL: 'https://rea.example.com',
  AUTH0_ISSUER: 'https://identity.example.com',
  AUTH0_AUDIENCE: 'https://rea.example.com',
  AUTH0_ALLOWED_SUBJECTS: 'auth0|owner',
};

test('incomplete and insecure configurations fail closed', () => {
  assert.equal(readOAuthConfiguration({}).enabled, false);
  for (const [key, value] of Object.entries({
    REA_PUBLIC_URL: 'http://rea.example.com',
    AUTH0_ISSUER: 'https://identity.example.com/path',
    AUTH0_AUDIENCE: 'https://other.example.com',
    AUTH0_ALLOWED_SUBJECTS: '',
  })) {
    assert.equal(readOAuthConfiguration({ ...valid, [key]: value }).enabled, false, key);
  }
  assert.equal(readOAuthConfiguration({ ...valid, REA_PUBLIC_URL: 'https://user:pass@rea.example.com' }).enabled, false);
});

test('metadata uses exact public resource and identity-provider origin', () => {
  const config = readOAuthConfiguration(valid);
  assert.equal(config.enabled, true);
  assert.deepEqual(oauthResourceMetadata(config), {
    resource: 'https://rea.example.com',
    authorization_servers: ['https://identity.example.com/'],
    bearer_methods_supported: ['header'],
    scopes_supported: ['rea:inspect'],
  });
  assert.match(oauthChallenge(config), /resource_metadata="https:\/\/rea.example.com\/\.well-known\/oauth-protected-resource"/);
});
