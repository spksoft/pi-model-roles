import type { ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { LIMITS, RESERVED_IDS, ROLE_ID } from "../core/defaults.js";
import { displayModel, sameModel } from "../core/model-identity.js";
import type { DefaultRole, Effort, RoleConfig } from "../core/types.js";
import { availableModels } from "../pi/adapters.js";
import type { AutoSetupController } from "../pi/auto-setup-controller.js";
import type { RolesController } from "../pi/controller.js";
import { reviewAutoSetup, startAutoSetup } from "./auto-setup.js";
import { confirmFirstCustomRoleRouting, saveRoleConfig } from "./config-save.js";
import { showRoleDashboard } from "./role-dashboard.js";
import { selectModel } from "./model-picker.js";

export function roleSummary(id: string, role: DefaultRole): string {
  return `${id} · ${role.model === "inherit" ? "Pi default" : displayModel(role.model)} · ${role.effort}`;
}

async function editRole(
  controller: RolesController,
  ctx: ExtensionContext,
  existingId?: string,
): Promise<void> {
  const snapshot = controller.store.snapshot;
  if (!snapshot) return;
  const draft = structuredClone(snapshot.config);
  let id = existingId;
  const editing = Boolean(id);
  if (!id) {
    if (Object.keys(draft.roles).length >= LIMITS.roles) {
      ctx.ui.notify("You can create up to 32 roles.", "warning");
      return;
    }
    id = (await ctx.ui.input("Create role — step 1 of 4: short role ID", "quick"))?.trim();
    if (!id) return;
    if (!ROLE_ID.test(id) || RESERVED_IDS.has(id) || Object.hasOwn(draft.roles, id)) {
      ctx.ui.notify(
        "Use a unique lowercase ID (letters, numbers, _ or -; up to 48 characters).",
        "warning",
      );
      return;
    }
  }
  let description: string | undefined;
  const old = draft.roles[id];
  if (id !== "default") {
    description = await ctx.ui.editor(
      `${editing ? "Edit" : "Create"} role — step 2 of 4: write a task-observable “Use when …” criterion; exclude model names and execution instructions`,
      old && "description" in old ? old.description : "",
    );
    if (description === undefined) return;
    description = description.trim();
    if (!description || Array.from(description).length > LIMITS.description) {
      ctx.ui.notify("Describe when Pi should choose this role (1–2000 characters).", "warning");
      return;
    }
  }
  const models = availableModels(ctx);
  if (!models.length && id !== "default") {
    ctx.ui.notify("No models are available. Configure a provider in Pi first.", "warning");
    return;
  }
  const model = await selectModel(ctx.ui, models, {
    title: `${editing ? "Edit" : "Create"} role — step 3 of 4: choose a model`,
    allowInherit: id === "default",
    current: old?.model,
  });
  if (!model) return;
  const resolved = model === "inherit" ? controller.baseline.model : model;
  const capabilities = models.find((item) => sameModel(item.ref, resolved));
  const efforts = [...(id === "default" ? ["inherit"] : []), ...(capabilities?.efforts ?? [])];
  if (!efforts.length) {
    ctx.ui.notify("That model has no supported reasoning effort.", "warning");
    return;
  }
  const effort = await ctx.ui.select(
    `${editing ? "Edit" : "Create"} role — step 4 of 4: choose reasoning effort`,
    efforts,
  );
  if (!effort) return;
  const updatedRole: RoleConfig["roles"][string] =
    id === "default"
      ? { model, effort: effort as DefaultRole["effort"] }
      : {
          model: model as Exclude<typeof model, "inherit">,
          effort: effort as Effort,
          description: description ?? "",
        };
  draft.roles[id] = updatedRole;
  if (model !== "inherit" && !availableModels(ctx).some((item) => sameModel(item.ref, model))) {
    ctx.ui.notify("That model is no longer available. Start the edit again.", "warning");
    return;
  }
  if (
    !(await ctx.ui.confirm(
      `${editing ? "Save changes" : "Create role"}?`,
      `${roleSummary(id, updatedRole)}${description ? `\n${description}` : ""}`,
    ))
  )
    return;
  if (!(await confirmFirstCustomRoleRouting(ctx, snapshot.config, draft))) return;
  await saveRoleConfig(controller, ctx, draft, snapshot.revision);
}

async function deleteRole(
  controller: RolesController,
  ctx: ExtensionContext,
  id: string,
): Promise<void> {
  const snapshot = controller.store.snapshot;
  if (
    !snapshot ||
    id === "default" ||
    !(await ctx.ui.confirm("Delete role?", `Delete “${id}”? Your current model will not change.`))
  )
    return;
  const draft = structuredClone(snapshot.config);
  delete draft.roles[id];
  await saveRoleConfig(controller, ctx, draft, snapshot.revision);
}

async function setAutoSelector(
  controller: RolesController,
  ctx: ExtensionContext,
  enabled: boolean,
): Promise<void> {
  const snapshot = controller.store.snapshot;
  if (!snapshot) {
    if (!enabled) controller.disable(ctx);
    ctx.ui.notify(
      enabled
        ? "Auto Selector cannot be enabled until the role configuration is valid."
        : "Auto Selector disabled for this session. The current model and effort stay selected.",
      enabled ? "warning" : "info",
    );
    return;
  }
  if (snapshot.config.enabled !== enabled) {
    const saved = await saveRoleConfig(
      controller,
      ctx,
      { ...snapshot.config, enabled },
      snapshot.revision,
    );
    if (!saved) return;
  }
  if (enabled) controller.resume(ctx);
  else controller.disable(ctx);
  ctx.ui.notify(
    enabled
      ? "Auto Selector enabled. Future eligible prompts may route to another role."
      : "Auto Selector disabled. The selected role, model, and effort stay in use.",
    "info",
  );
}

export async function showMenu(
  controller: RolesController,
  setup: AutoSetupController,
  ctx: ExtensionContext,
): Promise<void> {
  while (controller.active) {
    const snapshot = controller.store.snapshot;
    const roles = Object.entries(snapshot?.config.roles ?? {}).sort(([a], [b]) =>
      a === "default" ? -1 : b === "default" ? 1 : a.localeCompare(b),
    );
    const models = availableModels(ctx);
    const action = await showRoleDashboard(ctx.ui, {
      roles: roles.map(([id, role]) => {
        const ref = role.model === "inherit" ? controller.baseline.model : role.model;
        const model = models.find((item) => sameModel(item.ref, ref));
        const warning = !model
          ? " [unavailable]"
          : role.effort !== "inherit" && !model.efforts.includes(role.effort)
            ? " [effort adjusted]"
            : "";
        return {
          id,
          summary: roleSummary(id, role) + warning,
          description: "description" in role ? role.description : undefined,
        };
      }),
      warning: controller.store.error
        ? `${controller.store.error.message} (${controller.store.path})`
        : undefined,
    });
    if (action.type === "close") return;
    if (action.type === "add") await editRole(controller, ctx);
    else if (action.type === "edit") await editRole(controller, ctx, action.id);
    else if (action.type === "delete") await deleteRole(controller, ctx, action.id);
    else if (action.type === "auto-setup") {
      const launched = setup.currentDraft
        ? await reviewAutoSetup(controller, setup, ctx)
        : await startAutoSetup(setup, ctx);
      if (launched) return;
    }
  }
}

export async function handleCommand(
  controller: RolesController,
  setup: AutoSetupController,
  args: string,
  ctx: ExtensionCommandContext,
): Promise<void> {
  if (!controller.active || ctx.mode !== "tui") {
    if (ctx.hasUI)
      ctx.ui.notify(
        "Model-role management requires a primary TUI session. Headless hosts can use the selection API.",
        "warning",
      );
    return;
  }
  const run = /^run(?:\s+([\s\S]*))?$/.exec(args.trimStart());
  if (run) {
    await controller.runCommand(ctx, run[1] ?? "");
    return;
  }
  await ctx.waitForIdle();
  const parts = args.trim().split(/\s+/);
  const action = parts[0];
  if (!action || (action === "settings" && !parts[1])) await showMenu(controller, setup, ctx);
  else if (action === "enable" && !parts[1]) await setAutoSelector(controller, ctx, true);
  else if (action === "disable" && !parts[1]) await setAutoSelector(controller, ctx, false);
  else if (action === "use" && parts[1] && !parts[2]) await controller.use(ctx, parts[1]);
  else
    ctx.ui.notify(
      "Use /model-roles settings, /model-roles enable, /model-roles disable, /model-roles use <role>, or /model-roles run /command [arguments].",
      "info",
    );
}
