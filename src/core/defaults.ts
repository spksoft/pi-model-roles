import type { RoleConfig } from "./types.js";
export const LIMITS = Object.freeze({
  roles: 32,
  description: 2000,
  task: 16384,
  yamlBytes: 262144,
  modelField: 512,
  outputBytes: 16384,
  outputTokens: 2048,
});
export const ROLE_ID = /^[a-z][a-z0-9_-]{0,47}$/;
export const RESERVED_IDS = new Set(["constructor", "prototype", "__proto__"]);
export function defaultConfig(): RoleConfig {
  return {
    version: 1,
    enabled: true,
    selectorTimeoutMs: 8000,
    roles: { default: { model: "inherit", effort: "inherit" } },
  };
}
export function charLength(value: string): number {
  return Array.from(value).length;
}
