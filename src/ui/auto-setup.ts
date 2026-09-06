import type { ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { mergeProposal } from "../auto-setup/merge.js";
import type { AutoSetupDraft, MergeChoice } from "../auto-setup/types.js";
import { displayModel, sameModel } from "../core/model-identity.js";
import type { RoleConfig } from "../core/types.js";
import { availableModels } from "../pi/adapters.js";
import type { AutoSetupController } from "../pi/auto-setup-controller.js";
import type { RolesController } from "../pi/controller.js";
import { confirmFirstCustomRoleRouting, saveRoleConfig } from "./config-save.js";
import { selectModels } from "./model-multi-select.js";

function report(draft: AutoSetupDraft): string {
  const assessments = draft.proposal.assessments.map((assessment) => {
    const sources = assessment.sources.length
      ? assessment.sources
          .map((source) => `  - ${source.title}: ${source.url} (accessed ${source.accessedAt})`)
          .join("\n")
      : "  - No source URL reported.";
    const caveats = assessment.caveats.length
      ? `\n  Caveats: ${assessment.caveats.join("; ")}`
      : "";
    return `${displayModel(assessment.model)} — ${assessment.status}\n  ${assessment.summary}\n${sources}${caveats}`;
  });
  const roles = draft.proposal.roles.length
    ? draft.proposal.roles
        .map(
          (role) =>
            `${role.id}: ${displayModel(role.model)} · ${role.effort}\n  ${role.description}\n  Why: ${role.rationale}\n  Uncertainty: ${role.uncertainty}`,
        )
        .join("\n")
    : "No new custom roles recommended.";
  return `Auto Setup report — agent-reported sources are not independently verified.\nResearch model: ${displayModel(draft.researchModel)}\nReceived: ${draft.receivedAt}\n\n${draft.proposal.summary}\n\nEvidence\n${assessments.join("\n\n")}\n\nRecommended roles\n${roles}`;
}

function changedAssignmentsAvailable(
  ctx: ExtensionContext,
  changes: ReturnType<typeof mergeProposal>["changedAssignments"],
): boolean {
  const models = availableModels(ctx);
  return changes.every((change) => {
    const model = models.find((item) => sameModel(item.ref, change.model));
    return Boolean(model?.efforts.includes(change.effort));
  });
}

async function chooseMerge(
  ctx: ExtensionContext,
  draft: AutoSetupDraft,
  current: RoleConfig,
): Promise<MergeChoice | undefined> {
  const collisions = draft.proposal.roles
    .map((role) => role.id)
    .filter((id) => Object.hasOwn(current.roles, id));
  let replaceDefault = false;
  if (draft.proposal.default) {
    const choice = await ctx.ui.select("Suggested default", [
      "Keep existing default",
      "Use suggested default",
      "Cancel",
    ]);
    if (!choice || choice === "Cancel") return undefined;
    replaceDefault = choice === "Use suggested default";
  }
  if (!collisions.length) return { mode: "keep", replaceDefault };
  const choice = await ctx.ui.select("Existing role conflicts", [
    "Add non-conflicting suggestions only",
    "Choose replacements",
    "Replace all custom roles",
    "Cancel",
  ]);
  if (!choice || choice === "Cancel") return undefined;
  if (choice === "Add non-conflicting suggestions only") return { mode: "keep", replaceDefault };
  if (choice === "Replace all custom roles") return { mode: "replace-custom", replaceDefault };
  const replaceIds: string[] = [];
  for (const id of collisions) {
    const decision = await ctx.ui.select(`Conflict: ${id}`, [
      "Keep existing",
      "Use suggestion",
      "Cancel",
    ]);
    if (!decision || decision === "Cancel") return undefined;
    if (decision === "Use suggestion") replaceIds.push(id);
  }
  return { mode: "replace-selected", replaceIds, replaceDefault };
}

async function applyDraft(
  controller: RolesController,
  setup: AutoSetupController,
  ctx: ExtensionCommandContext,
  draft: AutoSetupDraft,
): Promise<void> {
  const snapshot = await controller.store.load(false);
  if (!snapshot || controller.store.error) {
    ctx.ui.notify(
      "Auto Setup cannot apply while role configuration is missing or invalid. Repair it first.",
      "warning",
    );
    return;
  }
  if (snapshot.revision !== draft.baseRevision) {
    ctx.ui.notify(
      "Role configuration changed after research. Review the proposal again against the latest configuration.",
      "warning",
    );
    return;
  }
  const choice = await chooseMerge(ctx, draft, snapshot.config);
  if (!choice) return;
  let merged;
  try {
    merged = mergeProposal(snapshot.config, draft.proposal, choice);
  } catch {
    ctx.ui.notify(
      "Auto Setup could not build a valid role configuration from this proposal.",
      "warning",
    );
    return;
  }
  if (!merged.changes.some((change) => change.kind !== "unchanged")) {
    ctx.ui.notify("This proposal makes no role configuration changes.", "info");
    return;
  }
  if (!changedAssignmentsAvailable(ctx, merged.changedAssignments)) {
    ctx.ui.notify(
      "A proposed changed model or effort is no longer available. Start a new research pass.",
      "warning",
    );
    return;
  }
  const changeText = merged.changes
    .filter((change) => change.kind !== "unchanged")
    .map((change) => `${change.kind}: ${change.id}`)
    .join("\n");
  if (choice.mode === "replace-custom") {
    if (
      !(await ctx.ui.confirm(
        "Replace all custom roles?",
        `This deletes existing custom roles before adding this proposal:\n${changeText}`,
      ))
    )
      return;
  }
  if (!(await confirmFirstCustomRoleRouting(ctx, snapshot.config, merged.config))) return;
  if (
    !(await ctx.ui.confirm(
      "Save Auto Setup role changes?",
      `${changeText}\n\nMenu saves normalize YAML formatting/comments.`,
    ))
  )
    return;
  const fresh = await controller.store.load(false);
  if (!fresh || controller.store.error || fresh.revision !== snapshot.revision) {
    ctx.ui.notify(
      "Role configuration changed before confirmation. Review the proposal again.",
      "warning",
    );
    return;
  }
  if (!changedAssignmentsAvailable(ctx, merged.changedAssignments)) {
    ctx.ui.notify(
      "A proposed changed model or effort is no longer available. Review again.",
      "warning",
    );
    return;
  }
  if (await saveRoleConfig(controller, ctx, merged.config, fresh.revision))
    setup.markApplied(ctx, draft);
}

export async function startAutoSetup(
  setup: AutoSetupController,
  ctx: ExtensionCommandContext,
): Promise<boolean> {
  const models = availableModels(ctx);
  if (!models.length) {
    ctx.ui.notify("No available models. Configure a provider in Pi first.", "warning");
    return false;
  }
  const selected = await selectModels(ctx.ui, models);
  if (!selected?.length) return false;
  const candidates = selected
    .map((ref) => models.find((model) => sameModel(model.ref, ref)))
    .filter((model): model is (typeof models)[number] => model !== undefined);
  if (!candidates.length) return false;
  const current = ctx.model
    ? displayModel({ provider: ctx.model.provider, id: ctx.model.id })
    : "no active model";
  if (
    !(await ctx.ui.confirm(
      "Start Auto Setup research?",
      `Research uses the current Pi model (${current}) and its normal conversation/provider data flow. Configured tools may make web requests, incur their own costs, and retain data under their policies. This package does not add credentials, change tool permissions, or sandbox the normal agent. If web research is unavailable, the agent may use explicitly labelled offline knowledge. Research consent is separate from future task-routing charges and configuration saving.`,
    ))
  )
    return false;
  return setup.beginResearch(ctx, candidates);
}

export async function reviewAutoSetup(
  controller: RolesController,
  setup: AutoSetupController,
  ctx: ExtensionCommandContext,
): Promise<boolean> {
  const draft = setup.currentDraft;
  if (!draft) {
    ctx.ui.notify(
      setup.currentStatus === "invalid_history"
        ? "Auto Setup history is not actionable. Start a new research pass."
        : "Auto Setup has no reviewable proposal.",
      "info",
    );
    return false;
  }
  ctx.ui.notify(report(draft), "info");
  const action = await ctx.ui.select("Auto Setup proposal", [
    "Discuss/refine",
    "Confirm settings",
    "Start over",
    "Cancel proposal",
    "Close",
  ]);
  if (!action || action === "Close") return false;
  if (action === "Confirm settings") {
    await applyDraft(controller, setup, ctx, draft);
    return false;
  }
  if (action === "Cancel proposal") {
    setup.cancel(ctx);
    return false;
  }
  if (action === "Discuss/refine") {
    const question = await ctx.ui.editor(
      "Discuss/refine Auto Setup (ordinary chat is not captured as setup discussion)",
      "",
    );
    if (!question) return false;
    return setup.beginRefinement(ctx, question.trim());
  }
  return startAutoSetup(setup, ctx);
}
