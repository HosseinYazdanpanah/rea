/** JWT verification uses the maintained jose library; do not implement cryptography here. */
import { createRemoteJWKSet, jwtVerify } from 'jose';

export function createBearerVerifier(config, { verificationKeys } = {}) {
  if (config?.enabled !== true) throw new Error('OAuth configuration required');
  const jwks = verificationKeys ?? createRemoteJWKSet(new URL(config.jwksUrl), {
    timeoutDuration: 3000,
    cooldownDuration: 30_000,
    cacheMaxAge: 10 * 60_000,
  });
  return async function verifyAccessToken(token) {
    if (typeof token !== 'string' || token.length < 30 || token.length > 12_000) {
      return { ok: false, reason: 'invalid_token' };
    }
    try {
      const { payload } = await jwtVerify(token, jwks, {
        issuer: config.issuer,
        audience: config.audience,
        algorithms: ['RS256'],
        clockTolerance: 5,
        requiredClaims: ['exp', 'iat', 'sub'],
      });
      if (typeof payload.sub !== 'string' || !config.subjects.includes(payload.sub)) {
        return { ok: false, reason: 'forbidden_user' };
      }
      const tokens = new Set([
        ...(typeof payload.scope === 'string' ? payload.scope.split(/\s+/) : []),
        ...(Array.isArray(payload.permissions) ? payload.permissions.filter((x) => typeof x === 'string') : []),
      ]);
      if (!config.scopes.every((scope) => tokens.has(scope))) {
        return { ok: false, reason: 'insufficient_scope' };
      }
      return { ok: true, subject: payload.sub, scope: [...tokens] };
    } catch {
      return { ok: false, reason: 'invalid_token' };
    }
  };
}
