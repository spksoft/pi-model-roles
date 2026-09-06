import type { ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { validateConfig } from "../config/schema.js";
import { LIMITS, RESERVED_IDS, ROLE_ID } from "../core/defaults.js";
import { displayModel, sameModel } from "../core/model-identity.js";
import type { DefaultRole, Effort, RoleConfig } from "../core/types.js";
import { availableModels } from "../pi/adapters.js";
import type { RolesController } from "../pi/controller.js";
export function roleSummary(id: string, role: DefaultRole): string {
  return `${id} — ${role.model === "inherit" ? "inherit Pi default" : displayModel(role.model)} · ${role.effort}`;
}
async function save(
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
async function editRole(
  controller: RolesController,
  ctx: ExtensionContext,
  existingId?: string,
): Promise<void> {
  const snapshot = controller.store.snapshot;
  if (!snapshot) return;
  const draft = structuredClone(snapshot.config);
  let id = existingId;
  if (!id) {
    if (Object.keys(draft.roles).length >= LIMITS.roles) {
      ctx.ui.notify("At most 32 roles are supported.", "warning");
      return;
    }
    id = (await ctx.ui.input("Role identifier", "fast"))?.trim();
    if (!id) return;
    if (!ROLE_ID.test(id) || RESERVED_IDS.has(id) || Object.hasOwn(draft.roles, id)) {
      ctx.ui.notify(
        "Use a unique lowercase identifier (letters, numbers, _ or -), up to 48 characters.",
        "warning",
      );
      return;
    }
  }
  let description: string | undefined;
  const old = draft.roles[id];
  if (id !== "default") {
    description = await ctx.ui.editor(
      "When should this role be used? (selection criteria, not execution instructions)",
      old && "description" in old ? old.description : "",
    );
    if (description === undefined) return;
    description = description.trim();
    if (!description || Array.from(description).length > LIMITS.description) {
      ctx.ui.notify("Describe when to use the role in 1–2000 characters.", "warning");
      return;
    }
  }
  const models = availableModels(ctx);
  const inherited = "Inherit Pi default";
  const labels = models.map((model, index) => `${index + 1}. ${displayModel(model.ref)}`);
  if (id === "default") labels.unshift(inherited);
  if (!labels.length) {
    ctx.ui.notify("No available models. Configure a provider in Pi first.", "warning");
    return;
  }
  const choice = await ctx.ui.select(
    `Model${old ? ` (current: ${old.model === "inherit" ? "inherit" : displayModel(old.model)})` : ""}`,
    labels,
  );
  if (!choice) return;
  const model = choice === inherited ? "inherit" : models[Number.parseInt(choice, 10) - 1]?.ref;
  if (!model) return;
  const resolved = model === "inherit" ? controller.baseline.model : model;
  const capabilities = models.find((item) => sameModel(item.ref, resolved));
  const efforts = [...(id === "default" ? ["inherit"] : []), ...(capabilities?.efforts ?? [])];
  if (!efforts.length) {
    ctx.ui.notify("No supported effort for this model.", "warning");
    return;
  }
  const effort = await ctx.ui.select("Select execution effort explicitly", efforts);
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
  // Recheck a withdrawn model before committing the draft; unknown saved roles stay visible.
  if (model !== "inherit" && !availableModels(ctx).some((item) => sameModel(item.ref, model))) {
    ctx.ui.notify("Model is no longer available. Start the edit again.", "warning");
    return;
  }
  if (
    !(await ctx.ui.confirm(
      "Save role?",
      `${roleSummary(id, updatedRole)}${description ? `\n${description}` : ""}\nMenu saves normalize YAML formatting/comments.`,
    ))
  )
    return;
  if (Object.keys(snapshot.config.roles).length === 1 && id !== "default") {
    if (
      !(await ctx.ui.confirm(
        "Enable task-based model selection?",
        "Each new idle interactive prompt may make one extra request to the default provider (cost and latency). That request includes submitted task text and role descriptions. The selected execution provider receives the normal conversation. No history or images go to the selector.",
      ))
    )
      return;
  }
  await save(controller, ctx, draft, snapshot.revision);
}
async function manageRole(
  controller: RolesController,
  ctx: ExtensionContext,
  id: string,
): Promise<void> {
  const options = ["Edit", "Use for this session", ...(id !== "default" ? ["Delete"] : []), "Back"];
  const action = await ctx.ui.select(`Role: ${id}`, options);
  if (action === "Edit") await editRole(controller, ctx, id);
  if (action === "Use for this session") await controller.use(ctx, id);
  if (action === "Delete") {
    const snapshot = controller.store.snapshot;
    if (
      !snapshot ||
      id === "default" ||
      !(await ctx.ui.confirm(
        "Delete role?",
        `Delete ${id}? The current execution model is not changed.`,
      ))
    )
      return;
    const draft = structuredClone(snapshot.config);
    delete draft.roles[id];
    await save(controller, ctx, draft, snapshot.revision);
  }
}
async function reset(controller: RolesController, ctx: ExtensionContext): Promise<void> {
  if (
    !(await ctx.ui.confirm(
      "Reset model role configuration?",
      `Replace only ${controller.store.path} with the inherited default role? Custom roles will be lost. Pi's own defaults remain unchanged.`,
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
      "Reset failed. Check the config file and lock; non-regular or oversized files require manual repair.",
      "warning",
    );
  }
}
export async function showMenu(controller: RolesController, ctx: ExtensionContext): Promise<void> {
  while (controller.active) {
    const snapshot = controller.store.snapshot;
    const roles = Object.entries(snapshot?.config.roles ?? {}).sort(([a], [b]) =>
      a === "default" ? -1 : b === "default" ? 1 : a < b ? -1 : a > b ? 1 : 0,
    );
    const models = availableModels(ctx);
    const rows = roles.map(([id, role]) => {
      const ref = role.model === "inherit" ? controller.baseline.model : role.model;
      const model = models.find((item) => sameModel(item.ref, ref));
      const warning = !model
        ? " [unavailable]"
        : role.effort !== "inherit" && !model.efforts.includes(role.effort)
          ? " [effort will clamp]"
          : "";
      return roleSummary(id, role) + warning;
    });
    const controls = [
      "Add role",
      controller.mode === "manual" ? "Resume auto-routing" : "Pause routing",
      snapshot?.config.enabled ? "Disable automatic routing" : "Enable automatic routing",
      "Status",
      "Reload",
      "Reset configuration",
      "Close",
    ];
    const choice = await ctx.ui.select(
      `Model roles · ${controller.mode} · inherited ${displayModel(controller.baseline.model)}:${controller.baseline.effort}\n${controller.store.path}${controller.store.error ? `\nWarning: ${controller.store.error.message}` : ""}`,
      [...rows, ...controls],
    );
    if (!choice || choice === "Close") return;
    const index = rows.indexOf(choice);
    const selectedRole = roles[index];
    if (selectedRole) {
      await manageRole(controller, ctx, selectedRole[0]);
      continue;
    }
    if (choice === "Add role") await editRole(controller, ctx);
    else if (choice === "Resume auto-routing") controller.resume(ctx);
    else if (choice === "Pause routing") controller.pause(ctx);
    else if (choice === "Reload") await controller.reload(ctx);
    else if (choice === "Reset configuration") await reset(controller, ctx);
    else if (choice === "Status") showStatus(controller, ctx);
    else if (snapshot)
      await save(
        controller,
        ctx,
        { ...snapshot.config, enabled: !snapshot.config.enabled },
        snapshot.revision,
      );
  }
}
export function showStatus(controller: RolesController, ctx: ExtensionContext): void {
  const decision = controller.lastDecision;
  ctx.ui.notify(
    `Model roles: ${controller.mode}; ${controller.store.path}\n${decision ? JSON.stringify(decision) : "No routing decision yet."}`,
    "info",
  );
}
export async function handleCommand(
  controller: RolesController,
  args: string,
  ctx: ExtensionCommandContext,
): Promise<void> {
  if (!controller.active || ctx.mode !== "tui") {
    if (ctx.hasUI)
      ctx.ui.notify(
        "Model role menus require a primary TUI session. Headless hosts should use the selection API.",
        "warning",
      );
    return;
  }
  await ctx.waitForIdle();
  const parts = args.trim().split(/\s+/);
  const action = parts[0];
  if (!action || action === "settings") await showMenu(controller, ctx);
  else if (action === "status") showStatus(controller, ctx);
  else if (action === "reload") await controller.reload(ctx);
  else if (action === "pause") controller.pause(ctx);
  else if (action === "auto") controller.resume(ctx);
  else if (action === "use" && parts[1]) await controller.use(ctx, parts[1]);
  else ctx.ui.notify("Use /model-roles [settings|status|reload|pause|auto|use <role>].", "info");
}
