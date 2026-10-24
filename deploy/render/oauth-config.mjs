/** Config validation is deliberately strict. An incomplete setup cannot enable OAuth. */
const VALID_SCOPE = 'rea:inspect';

function canonicalHttps(value, { allowPath = false } = {}) {
  if (typeof value !== 'string' || value.trim() !== value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) return null;
    if (!allowPath && parsed.pathname !== '/') return null;
    if (parsed.hostname === 'localhost' || parsed.hostname.endsWith('.localhost')) return null;
    return allowPath ? parsed.href.replace(/\/$/, '') : parsed.origin;
  } catch {
    return null;
  }
}

export function readOAuthConfiguration(env = process.env) {
  const resource = canonicalHttps(env.REA_PUBLIC_URL);
  const issuer = canonicalHttps(env.AUTH0_ISSUER);
  const audience = typeof env.AUTH0_AUDIENCE === 'string' ? env.AUTH0_AUDIENCE.trim() : '';
  const subjects = (env.AUTH0_ALLOWED_SUBJECTS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!resource || !issuer || !audience || audience !== resource || subjects.length === 0 || subjects.some((s) => s.length > 200)) {
    return { enabled: false, reason: 'oauth_configuration_incomplete' };
  }
  return {
    enabled: true,
    issuer: `${issuer}/`,
    resource,
    audience,
    subjects: Object.freeze([...new Set(subjects)]),
    scopes: Object.freeze([VALID_SCOPE]),
    jwksUrl: `${issuer}/.well-known/jwks.json`,
    metadataUrl: `${resource}/.well-known/oauth-protected-resource`,
  };
}

export function oauthResourceMetadata(config) {
  if (!config?.enabled) return null;
  return {
    resource: config.resource,
    authorization_servers: [config.issuer],
    bearer_methods_supported: ['header'],
    scopes_supported: [...config.scopes],
  };
}

export function oauthChallenge(config, error = 'invalid_token') {
  if (!config?.enabled) return null;
  return `Bearer resource_metadata="${config.metadataUrl}", scope="${config.scopes.join(' ')}", error="${error}"`;
}
