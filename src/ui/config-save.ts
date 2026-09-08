import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { ConfigError, validateConfig } from "../config/schema.js";
import { displayModel } from "../core/model-identity.js";
import type { RoleConfig } from "../core/types.js";
import type { RolesController } from "../pi/controller.js";

/** Only structured, non-sensitive categories; never interpolate arbitrary error messages. */
export function saveFailure(error: unknown, path: string): string {
  const code = error instanceof ConfigError ? error.code : "save_failed";
  const recovery: Record<string, string> = {
    conflict: "Configuration changed. Reload and review the edit again; never force overwrite.",
    lock_busy:
      "Another writer holds the lock. Retry after it finishes; never remove an active lock. Verify no writer remains before manually removing an abandoned config.yaml.lock directory.",
    permission_denied: "Check file and directory permissions; no overwrite was forced.",
    config_missing: "Configuration is missing. Run Pi's /reload before trying again.",
    unsafe_config_file: "Use a regular configuration file, not a symlink or directory.",
  };
  const field = error instanceof ConfigError && error.field !== "config" ? ` (${error.field})` : "";
  return `${code}${field}: ${path}. ${recovery[code] ?? "Check configuration validity and storage, then run Pi's /reload before reapplying."}`;
}

/** A UI failure cannot turn an already committed save into a failed save. */
export function notifySafely(
  ctx: ExtensionContext,
  message: string,
  level: "info" | "warning",
): void {
  try {
    ctx.ui.notify(message, level);
  } catch {
    // The host may already have torn down this UI. Do not retry committed writes.
  }
}

export async function saveRoleConfig(
  controller: RolesController,
  ctx: ExtensionContext,
  config: RoleConfig,
  revision: string,
): Promise<boolean> {
  try {
    validateConfig(config);
    controller.invalidate();
    await controller.store.save(config, revision);
  } catch (error) {
    notifySafely(
      ctx,
      `Could not save roles: ${saveFailure(error, controller.store.path)}`,
      "warning",
    );
    return false;
  }
  try {
    controller.status(ctx);
    ctx.ui.notify("Model roles saved. Other sessions pick up changes on reload.", "info");
  } catch {
    notifySafely(
      ctx,
      "Model roles were saved, but the UI could not refresh. Reload; do not retry the save.",
      "warning",
    );
  }
  return true;
}

export async function confirmFirstCustomRoleRouting(
  ctx: ExtensionContext,
  before: RoleConfig,
  after: RoleConfig,
  controller?: RolesController,
): Promise<boolean> {
  if (Object.keys(before.roles).length !== 1 || Object.keys(after.roles).length <= 1) return true;
  return ctx.ui.confirm(
    "Enable task-based model selection?",
    `Selector: ${displayModel(after.selector?.model ?? (after.roles.default.model === "inherit" ? controller?.baseline.model : after.roles.default.model))}; effort: ${after.selector?.effort ?? "adapter default"}. Global context: ${after.selectorContext ?? "prompt"}; effective here: ${controller?.contextPolicy(ctx).effective ?? after.selectorContext ?? "prompt"}. Existing session overrides are preserved. ` +
      "Each eligible new idle TUI submission, including an explicit /model-roles run command, may make one extra request to the configured selector provider (default-role provider unless an independent profile is set; cost and latency). The selector receives submitted task text and role descriptions. " +
      ((controller?.contextPolicy(ctx).effective ?? after.selectorContext) === "conversation"
        ? "For ordinary idle input (not the command wrapper), conversation mode also sends bounded retained user/assistant text and summaries; these may include sensitive copied content and unmarked template expansions. Raw thinking, tool calls/results and image bytes are excluded; loaded files are not collected separately. "
        : "History, tool results, image bytes, and loaded system/template/skill/context files are not automatically collected. ") +
      "Text included in selection is not secret-filtered. Tool-loop turns, queued follow-ups, and Auto Setup are not independently rerouted. The execution provider still receives Pi's normal conversation.",
  );
}
