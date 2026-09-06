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
      `${editing ? "Edit" : "Create"} role — step 2 of 4: when should Pi choose it?`,
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

async function reset(controller: RolesController, ctx: ExtensionContext): Promise<void> {
  if (
    !(await ctx.ui.confirm(
      "Reset model-role configuration?",
      `Remove all custom roles from ${controller.store.path}? Pi's own defaults will not change.`,
    ))
  )
    return;
  controller.invalidate();
  try {
    await controller.store.reset();
    await controller.reload(ctx);
    ctx.ui.notify("Model roles reset.", "info");
  } catch {
    ctx.ui.notify(
      "Reset failed. Check the configuration file and its lock, then repair it manually.",
      "warning",
    );
  }
}

export async function showMenu(
  controller: RolesController,
  setup: AutoSetupController,
  ctx: ExtensionCommandContext,
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
      routingEnabled: snapshot?.config.enabled ?? false,
      sessionMode: controller.mode,
      baseline: `${displayModel(controller.baseline.model)} · ${controller.baseline.effort}`,
      configPath: controller.store.path,
      warning: controller.store.error?.message,
    });
    if (action.type === "close") return;
    if (action.type === "add") await editRole(controller, ctx);
    else if (action.type === "edit") await editRole(controller, ctx, action.id);
    else if (action.type === "delete") await deleteRole(controller, ctx, action.id);
    else if (action.type === "use") await controller.use(ctx, action.id);
    else if (action.type === "toggle-session")
      controller.mode === "manual" ? controller.resume(ctx) : controller.pause(ctx);
    else if (action.type === "toggle-routing" && snapshot)
      await saveRoleConfig(
        controller,
        ctx,
        { ...snapshot.config, enabled: !snapshot.config.enabled },
        snapshot.revision,
      );
    else if (action.type === "reload") await controller.reload(ctx);
    else if (action.type === "reset") await reset(controller, ctx);
    else if (action.type === "status") showStatus(controller, ctx);
    else if (action.type === "auto-setup") {
      const launched = setup.currentDraft
        ? await reviewAutoSetup(controller, setup, ctx)
        : await startAutoSetup(setup, ctx);
      if (launched) return;
    }
  }
}

export function showStatus(controller: RolesController, ctx: ExtensionContext): void {
  const decision = controller.lastDecision;
  const routing =
    controller.mode === "auto"
      ? "Automatic routing is active"
      : "Routing is paused for this session";
  if (!decision) {
    ctx.ui.notify(`${routing}. No task has been routed in this session yet.`, "info");
    return;
  }
  if (decision.status === "selected" || decision.status === "preserved") {
    const selected = decision.role ? `role “${decision.role}”` : "the default role";
    const fallback = decision.fallback
      ? ` Pi used a fallback because ${decision.reason.replaceAll("_", " ")}.`
      : "";
    let selector = "";
    if (decision.selector) {
      selector = ` Selector: ${displayModel(decision.selector.model)} in ${decision.selector.durationMs} ms.`;
      if (decision.selector.usage)
        selector = ` Selector: ${displayModel(decision.selector.model)} in ${decision.selector.durationMs} ms (${decision.selector.usage.totalTokens} tokens).`;
    }
    ctx.ui.notify(
      `${routing}. Last task used ${selected}: ${displayModel(decision.model)} · ${decision.effort}.${fallback}${selector}`,
      "info",
    );
    return;
  }
  ctx.ui.notify(
    `${routing}. The last routing attempt did not change the model (${decision.reason.replaceAll("_", " ")}).`,
    "info",
  );
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
  const parts = args.trim().split(/\s+/);
  const action = parts[0];
  if (action === "auto-setup" && parts[1] === "cancel") {
    setup.cancel(ctx);
    return;
  }
  await ctx.waitForIdle();
  if (!action || action === "settings") await showMenu(controller, setup, ctx);
  else if (action === "status") showStatus(controller, ctx);
  else if (action === "reload") await controller.reload(ctx);
  else if (action === "pause") controller.pause(ctx);
  else if (action === "auto") controller.resume(ctx);
  else if (action === "use" && parts[1]) await controller.use(ctx, parts[1]);
  else if (action === "auto-setup" && !parts[1]) await startAutoSetup(setup, ctx);
  else if (action === "auto-setup" && parts[1] === "review")
    await reviewAutoSetup(controller, setup, ctx);
  else
    ctx.ui.notify(
      "Use /model-roles [settings|status|reload|pause|auto|use <role>|auto-setup [review|cancel]].",
      "info",
    );
}
