import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { createBearerVerifier } from './token-verifier.mjs';
import { readOAuthConfiguration } from './oauth-config.mjs';

const config = readOAuthConfiguration({
  REA_PUBLIC_URL: 'https://rea.example.com',
  AUTH0_ISSUER: 'https://login.example.com',
  AUTH0_AUDIENCE: 'https://rea.example.com',
  AUTH0_ALLOWED_SUBJECTS: 'auth0|owner',
});

async function signer() {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);
  jwk.kid = 'unit-key-1';
  jwk.alg = 'RS256';
  const verify = createBearerVerifier(config, { verificationKeys: createLocalJWKSet({ keys: [jwk] }) });
  const token = async (claims = {}, issuer = config.issuer, audience = config.audience) => new SignJWT({ scope: 'rea:inspect', ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: jwk.kid })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject(claims.sub ?? 'auth0|owner')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
  return { verify, token };
}

test('cryptographic verifier validates RS256, exact issuer, audience, expiry, scope, and subject', async () => {
  const { verify, token } = await signer();
  assert.equal((await verify(await token())).ok, true);
  assert.equal((await verify(await token({}, 'https://evil.example.com/'))).ok, false);
  assert.equal((await verify(await token({}, config.issuer, 'https://other.example.com'))).ok, false);
  assert.equal((await verify(await token({ sub: 'auth0|other' }))).reason, 'forbidden_user');
  assert.equal((await verify(await token({ scope: 'openid' }))).reason, 'insufficient_scope');
  assert.equal((await verify('not-a-jwt')).ok, false);
});
