import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { validateConfig } from "../config/schema.js";
import type { RoleConfig } from "../core/types.js";
import type { RolesController } from "../pi/controller.js";

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
    controller.status(ctx);
    ctx.ui.notify("Model roles saved. Other sessions pick up changes on reload.", "info");
    return true;
  } catch {
    ctx.ui.notify(
      "Could not save roles: invalid data, conflicting edit, or busy/unwritable file. Reload before reapplying; never force overwrite. For an abandoned lock, verify no writer is running before removing config.yaml.lock.",
      "warning",
    );
    return false;
  }
}

export async function confirmFirstCustomRoleRouting(
  ctx: ExtensionContext,
  before: RoleConfig,
  after: RoleConfig,
): Promise<boolean> {
  if (Object.keys(before.roles).length !== 1 || Object.keys(after.roles).length <= 1) return true;
  return ctx.ui.confirm(
    "Enable task-based model selection?",
    "Each new idle interactive prompt may make one extra request to the default provider (cost and latency). That request includes submitted task text and role descriptions. The selected execution provider receives the normal conversation. No history or images go to the selector.",
  );
}
