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
      ["prompt", "conversation", "full"],
    ));
  if (!mode || !current()) return;
  if (mode !== "prompt" && mode !== "conversation" && mode !== "full") {
    ctx.ui.notify("Use /model-roles context [prompt|conversation|full].", "info");
    return;
  }
  if (
    mode !== "prompt" &&
    !(await ctx.ui.confirm(
      `Allow ${mode} context in model selection?`,
      contextDisclosure(
        controller,
        mode,
        "This user-wide choice takes effect here after saving; other sessions require /reload.",
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
  if (saved)
    notifySafely(ctx, `Selector context: ${mode}. Other sessions require /reload.`, "info");
}

/** This view contains decision metadata, never raw prompts, history, or classifier output. */
export function explainRouting(controller: RolesController, ctx: ExtensionContext): void {
  const decision = controller.lastDecision;
  const lines = [
    `Auto Selector: ${controller.autoSelectorEnabled ? "enabled" : "disabled"}; configured context: ${controller.store.snapshot?.config.selectorContext ?? "prompt"}. Already transmitted requests cannot be undone.`,
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
        `Prepared context: ${routing.mode}; ${routing.messages} messages; ${routing.historyBytes} text bytes; truncated: ${routing.truncated}. ${routing.mode === "full" ? "Includes raw retained tool calls/results; excludes raw thinking, image bytes, custom entries/messages, and !! shell commands." : "Excludes raw thinking, tool calls/results, image bytes, arbitrary custom entries, system/skill files."}`,
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

function contextDisclosure(
  controller: RolesController,
  mode: "conversation" | "full",
  scope: string,
): string {
  if (mode === "full")
    return `Future eligible idle submissions may send up to 100,000 UTF-8 bytes of newest retained active-branch user/assistant text and summaries, including raw tool calls and results, to the selector provider/model ${selectorLabel(controller)}, which may differ from the execution provider. Raw thinking, image bytes, custom entries/messages, and !! shell commands remain excluded. Expanded skill text already retained in the conversation may be included. Tool output and all text are untrusted data, are not secret-filtered, can be sensitive, and can increase cost/latency. The selector may discard oldest retained records to fit its context window. No extra summarizer, tool calls, or mid-task switching is added. ${scope}`;
  return `Future eligible idle submissions may send up to 12 recent user/assistant text messages and existing summaries (16 KiB text total, 4 KiB per message) to the selector provider/model ${selectorLabel(controller)}, which may differ from the execution provider. History is taken only from retained active-branch context. Raw thinking, tool calls/results, images, arbitrary custom entries and loaded system/skill files are excluded; visible text and summaries can still contain sensitive information copied from them and unmarked past template expansions. Recognized skill envelopes are reduced to their invocation. This is not secret redaction. History can increase cost/latency and may be incomplete or stale. No extra summarizer, tool calls, or mid-task switching is added. ${scope}`;
}
