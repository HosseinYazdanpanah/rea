/**
 * Phase 2 review contract. No REA tool is approved by default.
 * Do not use a tool's MCP annotations as proof of read-only safety.
 * The future OAuth resource server must validate user, audience, and scope
 * BEFORE evaluating this tool authorization gate.
 */
export const APPROVED_TOOLS = new Map();

/**
 * @param {unknown} invocation MCP tools/call.params
 * @param {Map<string, {approved: boolean, authorizeArguments: (args: object) => boolean}>} approvedTools
 * @returns {{allowed: boolean, reason: string}}
 */
export function authorizeToolCall(invocation, approvedTools = APPROVED_TOOLS) {
  if (!invocation || typeof invocation !== 'object' || Array.isArray(invocation)) {
    return { allowed: false, reason: 'invalid_invocation' };
  }
  const { name, arguments: args = {} } = invocation;
  if (typeof name !== 'string' || name.length < 1 || name.length > 160) {
    return { allowed: false, reason: 'invalid_tool_name' };
  }
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    return { allowed: false, reason: 'invalid_arguments' };
  }
  if (!(approvedTools instanceof Map)) {
    return { allowed: false, reason: 'invalid_policy' };
  }
  const review = approvedTools.get(name);
  if (review?.approved !== true || typeof review.authorizeArguments !== 'function') {
    return { allowed: false, reason: 'tool_not_approved' };
  }
  try {
    if (review.authorizeArguments(args) !== true) {
      return { allowed: false, reason: 'arguments_not_approved' };
    }
  } catch {
    return { allowed: false, reason: 'arguments_not_approved' };
  }
  return { allowed: true, reason: 'approved' };
}
