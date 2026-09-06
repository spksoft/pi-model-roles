import { isAlias, parseDocument, stringify, visit } from "yaml";
import { LIMITS } from "../core/defaults.js";
import type { RoleConfig } from "../core/types.js";
import { ConfigError, validateConfig } from "./schema.js";
export function parseConfig(text: string): RoleConfig {
  if (Buffer.byteLength(text) > LIMITS.yamlBytes) throw new ConfigError("file_too_large");
  try {
    const document = parseDocument(text, {
      schema: "core",
      uniqueKeys: true,
      merge: false,
      prettyErrors: false,
    });
    if (document.errors.length || document.warnings.length) {
      const position = document.errors[0]?.pos?.[0] ?? document.warnings[0]?.pos?.[0] ?? 0;
      const prefix = text.slice(0, position);
      throw new ConfigError(
        "invalid_yaml",
        `line ${prefix.split("\n").length}, column ${position - prefix.lastIndexOf("\n")}`,
      );
    }
    visit(document, (_key, node) => {
      if (isAlias(node) || (node && typeof node === "object" && "tag" in node && node.tag))
        throw new ConfigError("unsupported_yaml_feature");
    });
    return validateConfig(document.toJS({ maxAliasCount: 0 }));
  } catch (error) {
    if (error instanceof ConfigError) throw error;
    throw new ConfigError("invalid_yaml");
  }
}
export function serializeConfig(config: RoleConfig): string {
  const text = stringify(validateConfig(config), { lineWidth: 100 });
  if (Buffer.byteLength(text) > LIMITS.yamlBytes) throw new ConfigError("file_too_large");
  return text;
}
