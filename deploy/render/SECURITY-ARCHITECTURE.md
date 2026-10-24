# REA MCP Gateway: security architecture and decision record

**Status:** Phase 2 design and fail-closed contract, not a working remote MCP server. Preserve upstream REA unmodified. The public network must NEVER reach unauthenticated REA operations.

## Components and trust boundaries

1. **ChatGPT** is an untrusted external MCP client until it completes OAuth. Never grant operations because a client claims to be ChatGPT in a header.
2. **Gateway public HTTPS listener** on Render terminates requests at a controlled boundary. In phase 2, every path under `/mcp` returns HTTP 503, and no traffic is forwarded to REA. Health output proves only a TCP listener, not MCP tool readiness.
3. **OAuth authorization service** is NOT implemented. Phase 3 must use a well-maintained provider and implement/verify the MCP OAuth 2.1 resource-server contract. Required: RFC 9728 protected resource metadata, authorization server discovery, Authorization Code + PKCE S256, CIMD or DCR client registration compatibility, bounded audience/scope tokens, revocation, expiry and refresh behavior. A 401 challenge should indicate the protected-resource metadata location. A raw API key in the URL or a shared static bearer key is not a substitute for that contract.
4. **Tool authorization** starts from an empty allowlist. For each future enabled tool, review its upstream implementation, side effects, path/network/device/process access, exact arguments and validation function. Reject unknown tools, unknown fields, schema mismatch and policy errors. MCP read-only hints are metadata only, not enforcement.
5. **REA MCP runtime** is a separate subprocess bound to `127.0.0.1:8765`. It is never publicly proxied until OAuth and policy have been verified. Existing REA HTTP transport is intended for one local client. Do not assume parallel sessions work.
6. **Analysis sandbox** is not provided by the current Dockerfile. Before enabling tool execution, run with non-root, filesystem and resource limits, per-session ephemeral writable input directory, allowlisted egress, CPU/time quotas, memory limits and explicit tool-specific consent where required. Path allowlisting alone does not prevent every symlink or TOCTOU escape.

## Threats and mitigations

| Threat | Current control | Required before enablement |
| --- | --- | --- |
| Anonymous internet visitor calls REA | Hard deny `/mcp` | OAuth 2.1 authentication and protected resource metadata |
| Mis-scoped or replayed bearer token | No token accepted | Issuer, audience, expiry and scope validation on **every** MCP request |
| Prompt injection asks for process execution | Tool catalog not reachable | Exact tool/argument allowlist, human approval for changes |
| Filesystem traversal or exfiltration | No input to REA gateway | Validated temporary uploads, sandbox and egress controls |
| Excessive requests and cold-start cost | HTTP timeout limits | Per-identity rate limits and per-tool CPU/memory budgets |
| Dependency compromise | Pinned package version | Lock/digest validation, image scanning, upstream monitoring |
| Container restarts lose data | No persistent data assumed | Document ephemeral state and externalize durable evidence |

## Operational constraints

- Render Free can sleep, rebuild containers and erase ephemeral local state. A public URL does **not** mean 24/7 always-on availability.
- Ghidra, IDA, adb, browsers and other optional providers are **not** bundled or tested by this foundation; never claim all REA tools are functional.
- Deploying this phase cannot satisfy ChatGPT plugin discovery because `/mcp` intentionally returns HTTP 503.
- Never put OAuth secrets, access tokens, private files or third-party credentials in public GitHub files, PR comments or diagnostics endpoints.
- Do not merge, publish or connect a public MCP service until the security gates and real process-level tests pass.

## Phase 2 acceptance (this commit)

- [x] Existing REA source remains unchanged, isolated adapter under `deploy/render`.
- [x] All external `/mcp` requests denied independent of method, authorization header or body content.
- [x] The tool review policy denies all tools by default and requires exact-name and argument-validator approval.
- [x] GET health distinguishes a reachable loopback port from a working authenticated MCP session.
- [x] Workflow checks run automatically on branch/PR changes (subject to GitHub Actions availability).
- [ ] Production OAuth and tool authorization integration (Phase 3).
- [ ] Actual running container, Docker image build and upstream REA MCP handshake (Phase 4).
- [ ] Render deployment and real ChatGPT connection (Phase 5+).

## Sources

- https://developers.openai.com/plugins/build/auth
- https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt
- https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
- https://github.com/morluto/rea
