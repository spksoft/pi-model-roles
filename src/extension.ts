import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerSelectionService } from "./api/events.js";
import { ConfigStore } from "./config/store.js";
import { RolesController } from "./pi/controller.js";
import { AutoSetupController } from "./pi/auto-setup-controller.js";
import { registerAutoSetupTool } from "./auto-setup/tool.js";
import { hasStartupChoice } from "./pi/startup-choice.js";
import { reviewAutoSetup } from "./ui/auto-setup.js";
import { handleCommand } from "./ui/menu.js";

export function modelRoleCommandCompletions(
  autoSelectorEnabled: boolean,
  roleIds: readonly string[],
  prefix: string,
): Array<{ value: string; label: string }> {
  return [
    { value: "settings", label: "Settings" },
    autoSelectorEnabled
      ? { value: "disable", label: "Disable Auto Selector" }
      : { value: "enable", label: "Enable Auto Selector" },
    ...roleIds.map((id) => ({ value: `use ${id}`, label: `Use ${id}` })),
    { value: "run", label: "Run command with model routing" },
    { value: "context", label: "Choose selector context (with consent)" },
    { value: "why", label: "Explain the last selection" },
  ].filter((item) => item.value.startsWith(prefix));
}

export default function modelRoles(pi: ExtensionAPI): void {
  // Capture at factory time: some SDK child hosts temporarily change process.env while loading.
  const child = process.env.PI_SUBAGENT_CHILD === "1" || process.env.PI_SUBAGENT_CHILD === "true";
  const agentDir = getAgentDir();
  const controller = new RolesController(
    pi,
    new ConfigStore(agentDir),
    agentDir,
    child,
    hasStartupChoice(process.argv.slice(2)),
  );
  const autoSetup = new AutoSetupController(pi, controller.store, () => controller.active);
  let autoSetupToolRegistered = false;
  let autoReviewTimer: ReturnType<typeof setTimeout> | undefined;
  let disposeService: (() => void) | undefined;
  pi.registerCommand("model-roles", {
    description: "Manage task-routing roles",
    getArgumentCompletions: (prefix) =>
      modelRoleCommandCompletions(
        controller.autoSelectorEnabled,
        Object.keys(controller.store.snapshot?.config.roles ?? {}),
        prefix,
      ),
    handler: (args, ctx) => handleCommand(controller, autoSetup, args, ctx),
  });
  pi.on("session_start", async (event, ctx) => {
    if (!autoSetupToolRegistered) {
      registerAutoSetupTool(pi, autoSetup);
      autoSetupToolRegistered = true;
    }
    disposeService?.();
    await controller.start(ctx, event.reason);
    autoSetup.start(ctx);
    if (controller.active)
      disposeService = registerSelectionService(
        pi.events,
        ctx.sessionManager.getSessionId(),
        (request) => controller.select(ctx, request),
      );
  });
  // Pi 0.85.1 captures the dispatch model/effort before `context`. Route only
  // supported idle submissions here; never apply automatic decisions at `context`.
  pi.on("input", (event, ctx) => {
    autoSetup.ordinaryInput(event, ctx);
    return controller.input(event, ctx);
  });
  pi.on("model_select", (_event, ctx) => {
    autoSetup.modelChanged(ctx);
    controller.externalChange(ctx, "model");
  });
  pi.on("thinking_level_select", (_event, ctx) => {
    autoSetup.modelChanged(ctx);
    controller.externalChange(ctx, "effort");
  });
  pi.on("agent_start", (_event, ctx) => {
    controller.agentStarted();
    autoSetup.agentStarted(ctx);
  });
  pi.on("agent_settled", (_event, ctx) => {
    const requestId = autoSetup.agentSettled(ctx);
    if (!requestId) return;
    if (autoReviewTimer) clearTimeout(autoReviewTimer);
    autoReviewTimer = setTimeout(() => {
      autoReviewTimer = undefined;
      if (!autoSetup.claimAutomaticReview(ctx, requestId)) {
        if (controller.active)
          ctx.ui.notify("Auto Setup review remains available at the top of Settings.", "info");
        return;
      }
      void reviewAutoSetup(controller, autoSetup, ctx).catch(() => {
        if (controller.active)
          ctx.ui.notify(
            "Auto Setup could not open its review. Open Settings to try again.",
            "warning",
          );
      });
    }, 0);
  });
  pi.on("session_compact", () => controller.invalidate());
  pi.on("session_tree", (_event, ctx) => {
    controller.tree(ctx);
    autoSetup.tree(ctx);
  });
  pi.on("session_shutdown", (_event, ctx) => {
    if (autoReviewTimer) clearTimeout(autoReviewTimer);
    autoReviewTimer = undefined;
    disposeService?.();
    disposeService = undefined;
    autoSetup.shutdown();
    controller.shutdown(ctx);
  });
}
