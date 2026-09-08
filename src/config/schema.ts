import { LIMITS, RESERVED_IDS, ROLE_ID, charLength } from "../core/defaults.js";
import { isEffort, isModelRef, isRecord } from "../core/model-identity.js";
import type { CustomRole, DefaultRole, RoleConfig } from "../core/types.js";
export class ConfigError extends Error {
  constructor(
    public readonly code: string,
    public readonly field = "config",
  ) {
    super(`${code}: ${field}`);
    this.name = "ConfigError";
  }
}
function keys(value: Record<string, unknown>, allowed: string[], field: string): void {
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    throw new ConfigError("unknown_field", field);
}
function role(value: unknown, isDefault: boolean, field: string): DefaultRole | CustomRole {
  if (!isRecord(value)) throw new ConfigError("expected_role", field);
  keys(value, isDefault ? ["model", "effort"] : ["model", "effort", "description"], field);
  if (!(isModelRef(value.model) || (isDefault && value.model === "inherit")))
    throw new ConfigError("invalid_model", `${field}.model`);
  if (!(isEffort(value.effort) || (isDefault && value.effort === "inherit")))
    throw new ConfigError("invalid_effort", `${field}.effort`);
  if (
    !isDefault &&
    (typeof value.description !== "string" ||
      !value.description.trim() ||
      charLength(value.description.trim()) > LIMITS.description)
  )
    throw new ConfigError("invalid_description", `${field}.description`);
  const model = value.model === "inherit" ? "inherit" : { ...(value.model as CustomRole["model"]) };
  if (isDefault) return { model, effort: value.effort as DefaultRole["effort"] };
  return {
    model: model as CustomRole["model"],
    effort: value.effort as CustomRole["effort"],
    description: (value.description as string).trim(),
  };
}
export function validateConfig(value: unknown): RoleConfig {
  if (!isRecord(value)) throw new ConfigError("expected_object");
  keys(value, ["version", "enabled", "selectorTimeoutMs", "selectorContext", "roles"], "config");
  if (
    value.selectorContext !== undefined &&
    value.selectorContext !== "prompt" &&
    value.selectorContext !== "conversation"
  )
    throw new ConfigError("invalid_selector_context", "selectorContext");
  if (value.version !== 1) throw new ConfigError("unsupported_version", "version");
  if (value.enabled !== undefined && typeof value.enabled !== "boolean")
    throw new ConfigError("invalid_boolean", "enabled");
  const timeout = value.selectorTimeoutMs ?? 8000;
  if (
    !Number.isInteger(timeout) ||
    typeof timeout !== "number" ||
    timeout < 1000 ||
    timeout > 60000
  )
    throw new ConfigError("invalid_timeout", "selectorTimeoutMs");
  if (!isRecord(value.roles) || !Object.hasOwn(value.roles, "default"))
    throw new ConfigError("missing_default", "roles");
  const ids = Object.keys(value.roles);
  if (ids.length > LIMITS.roles) throw new ConfigError("too_many_roles", "roles");
  const roles: RoleConfig["roles"] = { default: role(value.roles.default, true, "roles.default") };
  for (const id of ids.sort()) {
    if (!ROLE_ID.test(id) || RESERVED_IDS.has(id))
      throw new ConfigError("invalid_role_id", "roles");
    if (id !== "default") roles[id] = role(value.roles[id], false, `roles.${id}`);
  }
  return {
    version: 1,
    enabled: value.enabled ?? true,
    selectorTimeoutMs: timeout,
    roles,
    ...(value.selectorContext === undefined
      ? {}
      : { selectorContext: value.selectorContext as RoleConfig["selectorContext"] }),
  };
}
export function freezeConfig(config: RoleConfig): RoleConfig {
  for (const value of Object.values(config.roles)) {
    if (value.model !== "inherit") Object.freeze(value.model);
    Object.freeze(value);
  }
  Object.freeze(config.roles);
  return Object.freeze(config);
}
