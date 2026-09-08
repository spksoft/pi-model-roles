import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { RolesController } from "../pi/controller.js";
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
      "Future eligible idle submissions may send up to 12 recent user/assistant text messages and existing summaries (16 KiB text total, 4 KiB per message) to the default selector provider, which may differ from the execution provider. History is taken only from retained active-branch context. Raw thinking, tool calls/results, images, arbitrary custom entries and loaded system/skill files are excluded; visible text and summaries can still contain sensitive information copied from them and unmarked past template expansions. Recognized skill envelopes are reduced to their invocation. This is not secret redaction. History can increase cost/latency and may be incomplete. No extra summarizer, tool calls, or mid-task switching is added. This user-wide choice takes effect here after saving; other sessions require /reload.",
    ))
  )
    return;
  if (!current()) return;
  await saveRoleConfig(
    controller,
    ctx,
    { ...snapshot.config, selectorContext: mode },
    snapshot.revision,
  );
}

/** This view contains decision metadata, never raw prompts, history, or classifier output. */
export function explainRouting(controller: RolesController, ctx: ExtensionContext): void {
  const decision = controller.lastDecision;
  const lines = [
    `Auto Selector: ${controller.autoSelectorEnabled ? "enabled" : "disabled"}; configured context: ${controller.store.snapshot?.config.selectorContext ?? "prompt"}.`,
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
    if (decision.selector) {
      if (!routing) lines.push("Prepared context: prompt; no retained conversation sent.");
      lines.push(
        `Selector: ${displayModel(decision.selector.model)}; ${decision.selector.durationMs} ms.`,
      );
      if (decision.selector.usage)
        lines.push(
          `Selector tokens: ${decision.selector.usage.totalTokens}; provider-reported cost: ${decision.selector.usage.cost}.`,
        );
    } else lines.push("No classifier request recorded for this decision.");
  }
  ctx.ui.notify(lines.join("\n"), "info");
}
