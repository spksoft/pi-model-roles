import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { displayModel, isEffort, sameModel } from "../core/model-identity.js";
import {
  availableModels,
  requiredSelectorEffort,
  selectorEffortAllowed,
  selectorEfforts,
} from "../pi/adapters.js";
import type { RolesController } from "../pi/controller.js";
import { notifySafely, saveFailure, saveRoleConfig } from "./config-save.js";
import { selectModel } from "./model-picker.js";

export function selectorLabel(controller: RolesController): string {
  const config = controller.store.snapshot?.config;
  return displayModel(
    config?.selector?.model ??
      (config?.roles.default.model === "inherit"
        ? controller.baseline.model
        : config?.roles.default.model),
  );
}
export async function configureSelector(
  controller: RolesController,
  ctx: ExtensionContext,
): Promise<void> {
  const current = controller.captureGuard(ctx);
  const snapshot = await controller.store.load(false);
  if (!current()) return;
  if (!snapshot || controller.store.error) {
    notifySafely(
      ctx,
      `Cannot change selector: ${saveFailure(controller.store.error, controller.store.path)}`,
      "warning",
    );
    return;
  }
  const action = await ctx.ui.select(
    `Selector: ${selectorLabel(controller)}; effort: ${snapshot.config.selector?.effort ?? "adapter default"}`,
    ["choose", "reset"],
  );
  if (!current() || !action) return;
  const draft = structuredClone(snapshot.config);
  if (action === "reset") delete draft.selector;
  else if (action === "choose") {
    const model = await selectModel(ctx.ui, availableModels(ctx), {
      title: "Choose independent selector model",
      current: draft.selector?.model,
    });
    if (!current() || !model || model === "inherit") return;
    const effort = await ctx.ui.select(
      "Selector effort (explicit support currently verified for OpenAI Responses only)",
      [
        ...(requiredSelectorEffort(ctx, model) === undefined ? ["adapter default"] : []),
        ...selectorEfforts(ctx, model),
      ],
    );
    if (!current() || !effort || (effort !== "adapter default" && !isEffort(effort))) return;
    if (!selectorEffortAllowed(ctx, model, isEffort(effort) ? effort : undefined)) return;
    draft.selector = { model, ...(isEffort(effort) ? { effort } : {}) };
  } else return;
  const ref =
    draft.selector?.model ??
    (draft.roles.default.model === "inherit"
      ? controller.baseline.model
      : draft.roles.default.model);
  const policy = controller.contextPolicy(ctx);
  if (
    !(await ctx.ui.confirm(
      action === "reset" ? "Reset independent selector?" : "Save independent selector?",
      `Selector provider/model: ${displayModel(ref)}; effort: ${draft.selector?.effort ?? "adapter default (no explicit option)"}. Effective idle-input context: ${policy.effective}; global: ${policy.global}; session override: ${policy.override ?? "inherit"}. Each eligible task may add one request, cost and latency. Task text and role descriptions are sent; conversation mode also sends bounded retained visible dialogue/summaries that may contain secrets or unmarked templates. No secret redaction. The provider may differ from execution. Failure uses normal execution fallback, never a second selector provider. This user-wide profile is saved to role YAML; other sessions need reload. Auto Setup preserves it. Execution defaults/current model and effort are unchanged.`,
    ))
  )
    return;
  if (!current() || controller.contextPolicy(ctx).revision !== policy.revision) return;
  if (
    ref &&
    (!availableModels(ctx).some((item) => sameModel(item.ref, ref)) ||
      !selectorEffortAllowed(ctx, ref, draft.selector?.effort))
  ) {
    notifySafely(
      ctx,
      "Selector model or effort is no longer eligible. Start again; nothing saved.",
      "warning",
    );
    return;
  }
  await saveRoleConfig(controller, ctx, draft, snapshot.revision);
}
