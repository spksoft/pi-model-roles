import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { RolesController } from "../pi/controller.js";
import { selectorLabel } from "./selector-settings.js";
import { displayModel } from "../core/model-identity.js";
import { notifySafely, saveFailure, saveRoleConfig } from "./config-save.js";

export async function configureRoutingContext(
  controller: RolesController,
  ctx: ExtensionContext,
  requested?: string,
): Promise<void> {
  const current = controller.captureGuard(ctx);
  const snapshot = await controller.store.load(false);
  if (!current()) return;
  if (!snapshot || controller.store.error) {
    notifySafely(
      ctx,
      `Cannot change routing context: ${saveFailure(controller.store.error, controller.store.path)}`,
      "warning",
    );
    return;
  }
  const mode =
    requested ??
    (await ctx.ui.select(
      `Selector context (current: ${snapshot.config.selectorContext ?? "prompt"})`,
      ["prompt", "conversation"],
    ));
  if (!mode || !current()) return;
  if (mode !== "prompt" && mode !== "conversation") {
    ctx.ui.notify("Use /model-roles context [prompt|conversation].", "info");
    return;
  }
  if (
    mode === "conversation" &&
    !(await ctx.ui.confirm(
      "Allow conversation context in model selection?",
      conversationDisclosure(
        controller,
        "This user-wide choice takes effect here after saving; other sessions require /reload. Session overrides are preserved and may mask it.",
      ),
    ))
  )
    return;
  if (!current()) return;
  const saved = await saveRoleConfig(
    controller,
    ctx,
    { ...snapshot.config, selectorContext: mode },
    snapshot.revision,
  );
  if (saved) notifySafely(ctx, policySummary(controller, ctx), "info");
}

/** This view contains decision metadata, never raw prompts, history, or classifier output. */
export function explainRouting(controller: RolesController, ctx: ExtensionContext): void {
  const decision = controller.lastDecision;
  const lines = [
    `Auto Selector: ${controller.autoSelectorEnabled ? "enabled" : "disabled"}; configured context: ${controller.store.snapshot?.config.selectorContext ?? "prompt"}. ${policySummary(controller, ctx)}`,
  ];
  if (!decision)
    lines.push("No selection receipt in this runtime yet. Reload clears the last-decision view.");
  else {
    lines.push(
      `Reason: ${decision.reason}; fallback: ${decision.fallback}; status: ${decision.status}.`,
    );
    if (decision.status === "selected" || decision.status === "preserved")
      lines.push(
        `Role: ${decision.role ?? "none"}; model: ${displayModel(decision.model)}; effort: ${decision.effort}.`,
      );
    const routing = decision.routing;
    if (routing)
      lines.push(
        `Prepared context: ${routing.mode}; ${routing.messages} messages; ${routing.historyBytes} text bytes; truncated: ${routing.truncated}. Excluded: raw thinking, tool calls/results, image bytes, arbitrary custom entries, system/skill files.`,
      );
    if (routing)
      lines.push(
        `Selector-budget history removal: ${routing.budgetRemovedMessages ?? 0} messages.`,
      );
    const projection = controller.lastProjection;
    if (projection)
      lines.push(
        `Projection included: user=${projection.included.user}, assistant=${projection.included.assistant}, summary=${projection.included.summary}. Observed omissions: tools=${projection.omitted.tools}, reasoning=${projection.omitted.reasoning}, images=${projection.omitted.images}, custom=${projection.omitted.custom}, skillBodies=${projection.omitted.skillBodies}.`,
        `Projection clipping: message limit=${projection.messageLimit}, byte limit=${projection.byteLimit}; observations partial=${projection.observationsPartial}; summary freshness=${projection.summaryFreshness}. Prepared evidence may be incomplete, stale or irrelevant; freshness is not detected.`,
      );
    if (decision.selector) {
      if (!routing) lines.push("Prepared context: prompt; no retained conversation sent.");
      lines.push(
        `Selector: ${displayModel(decision.selector.model)}; ${decision.selector.durationMs} ms; effort: ${decision.selector.effort ?? "adapter default"}. Classifier invoked; provider delivery is not independently verified.`,
      );
      if (decision.selector.usage)
        lines.push(
          `Selector tokens: ${decision.selector.usage.totalTokens}; provider-reported cost: ${decision.selector.usage.cost}.`,
        );
    } else lines.push("No classifier request recorded for this decision.");
  }
  if (decision?.status === "selected" || decision?.status === "preserved") {
    const window = ctx.modelRegistry.find(
      decision.model.provider,
      decision.model.id,
    )?.contextWindow;
    const tokens = ctx.getContextUsage()?.tokens;
    lines.push(
      typeof tokens === "number" &&
        Number.isFinite(tokens) &&
        tokens >= 0 &&
        typeof window === "number" &&
        Number.isFinite(window) &&
        window > 0
        ? `Approximate execution-context pressure: ${Math.round((tokens / window) * 100)}% of selected model's advertised window (host token estimate). Not a capacity guarantee; final payload/output reserve may differ. Pi owns compaction.`
        : "Approximate execution-context pressure: unknown. Pi owns compaction.",
    );
  }
  ctx.ui.notify(lines.join("\n"), "info");
}

export function policySummary(controller: RolesController, ctx: ExtensionContext): string {
  const policy = controller.contextPolicy(ctx);
  return `Global context: ${policy.global}; session override: ${policy.override ?? "inherit"}; effective context: ${policy.effective}. Override lasts only in this process (including reload/tree/revisit); same session UUID and agent directory share it across hosts. New/forked sessions and process restart use global. Already transmitted requests cannot be undone.`;
}
function conversationDisclosure(controller: RolesController, scope: string): string {
  return `Future eligible idle submissions may send up to 12 recent user/assistant text messages and existing summaries (16 KiB text total, 4 KiB per message) to the selector provider/model ${selectorLabel(controller)}, which may differ from the execution provider. History is taken only from retained active-branch context. Raw thinking, tool calls/results, images, arbitrary custom entries and loaded system/skill files are excluded; visible text and summaries can still contain sensitive information copied from them and unmarked past template expansions. Recognized skill envelopes are reduced to their invocation. This is not secret redaction. History can increase cost/latency and may be incomplete or stale. No extra summarizer, tool calls, or mid-task switching is added. ${scope}`;
}
export async function configureSessionContext(
  controller: RolesController,
  ctx: ExtensionContext,
  requested?: string,
): Promise<void> {
  const current = controller.captureGuard(ctx);
  const before = controller.contextPolicy(ctx);
  const mode =
    requested ??
    (await ctx.ui.select(policySummary(controller, ctx), ["prompt", "conversation", "inherit"]));
  if (!current() || !mode) return;
  if (mode !== "prompt" && mode !== "conversation" && mode !== "inherit") {
    notifySafely(ctx, "Use /model-roles context-session [prompt|conversation|inherit].", "info");
    return;
  }
  if (
    (mode === "conversation" || (mode === "inherit" && before.global === "conversation")) &&
    !(await ctx.ui.confirm(
      "Allow conversation context for this logical session?",
      conversationDisclosure(
        controller,
        policySummary(controller, ctx) +
          " This change shares one logical-session override across hosts opening the same UUID under the same agent directory in this process. No YAML or session-entry save. Unrelated actions do not clear it.",
      ),
    ))
  )
    return;
  if (!current() || controller.contextPolicy(ctx).revision !== before.revision) return;
  if (!controller.setContextPolicy(ctx, mode === "inherit" ? undefined : mode)) {
    notifySafely(
      ctx,
      "Session override not changed: runtime capacity reached or session changed. Existing overrides are never evicted. Pause routing with /model-roles disable if needed.",
      "warning",
    );
    return;
  }
  notifySafely(ctx, policySummary(controller, ctx), "info");
}
