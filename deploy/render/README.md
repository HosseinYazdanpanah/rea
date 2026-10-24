# REA MCP on Render: secure foundation (phase 1)

This is a **preparatory, fail-closed deployment**, NOT a working ChatGPT MCP connector.

## What it does

- Starts the pinned official `rea-agents@6.7.0` CLI inside a Node 24 container.
- Binds the original Streamable HTTP MCP server to **127.0.0.1:8765** only.
- Exposes `/healthz` for deployment diagnostics, without publishing the upstream server.
- Returns **HTTP 503 for every `/mcp` request** until authentication, authorization, and proxy tests are implemented and independently validated.

## What it deliberately does NOT do

- It does not permit ChatGPT to call REA yet.
- It does not claim production readiness, persistent state, authenticated users or file upload safety.
- It does not install native optional analyzers such as Ghidra, IDA, adb, or mobile tooling.
- It cannot inspect a user's personal computer remotely.

## Next implementation gates (must all pass)

1. Decide and implement an OpenAI-compatible OAuth 2.1 authorization server (or supported hosted IdP), including resource metadata, PKCE S256, client registration, proper redirect allowlists, consent, audience-bound access tokens, revocation, and durable credentials. Do not implement custom cryptography.
2. Parse the REA MCP tool catalog and explicitly allow only reviewed tool names **and argument schemas**, limiting their file access to a sandboxed upload directory. Do not trust `readOnlyHint` as an access control. Deny unknown tools.
3. Constrain process execution, file access, network egress, size/time limits, active sessions and upload handling with OS/container policy. Administrative tools that start processes, change files or devices must remain disabled by default.
4. Verify a real MCP initialize -> tools/list -> allowed tools/call path with the actual deployed REA process and ChatGPT OAuth flow; test anonymous denial, tool-name spoofing, malformed requests, replay, token expiration, and origin confusion.
5. Measure actual Render free-tier memory and cold start performance; specify limitations before user approves external publication. Avoid permanent evidence or files on ephemeral disks.

## Deployment inputs

For an exploratory Render Docker Web Service, use this repository and choose:

- Docker context: `deploy/render`
- Dockerfile: `deploy/render/Dockerfile`
- Plan: Free (only if supported by your account)
- Health check: `/healthz`

Do not point ChatGPT's Custom MCP form to `/mcp` from this phase. It will return `503` intentionally. Keep any future Gateway keys in Render Environment Variables, never in Git.

## Test without external dependencies

From this directory, run `node --test gateway.test.mjs`. These tests cover the fail-closed boundary and diagnostic routes; they do **not** establish that Docker, REA, OAuth, or ChatGPT integrations work yet.

## Upstream preservation

The canonical REA runtime and source architecture are left untouched. This folder is a separate deployment adapter for the user's fork. Upstream README and LICENSE remain authoritative.
