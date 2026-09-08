export type ContextPolicy = "prompt" | "conversation";
interface PolicyState {
  policy?: ContextPolicy;
  revision: number;
}
interface RuntimePolicies {
  version: 1;
  entries: Map<string, PolicyState>;
  revision: number;
}
// Logical-session process scope: survives extension module reload, never serialized.
// A new contract must use a new symbol; do not reinterpret existing singleton state.
const symbol = Symbol.for("pi-model-roles:context-policies:v1");
const globals = globalThis as typeof globalThis & { [symbol]?: RuntimePolicies };
const state = (globals[symbol] ??= { version: 1, entries: new Map(), revision: 0 });
export const CONTEXT_OVERRIDE_LIMIT = 1024;
function key(agentDir: string, sessionId: string): string {
  return JSON.stringify([agentDir, sessionId]);
}
export function contextOverride(agentDir: string, sessionId: string): Readonly<PolicyState> {
  return { ...(state.entries.get(key(agentDir, sessionId)) ?? { revision: 0 }) };
}
export function setContextOverride(
  agentDir: string,
  sessionId: string,
  policy?: ContextPolicy,
): boolean {
  if (policy !== undefined && policy !== "prompt" && policy !== "conversation") return false;
  const id = key(agentDir, sessionId);
  if (!state.entries.has(id) && state.entries.size >= CONTEXT_OVERRIDE_LIMIT) return false;
  // Keep tombstones on inherit: change-then-revert must invalidate pending selections.
  state.entries.set(id, { ...(policy ? { policy } : {}), revision: ++state.revision });
  return true;
}
