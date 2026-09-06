import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerSelectionService } from "./api/events.js";
import { ConfigStore } from "./config/store.js";
import { RolesController } from "./pi/controller.js";
import { AutoSetupController } from "./pi/auto-setup-controller.js";
import { registerAutoSetupTool } from "./auto-setup/tool.js";
import { hasStartupChoice } from "./pi/startup-choice.js";
import { handleCommand } from "./ui/menu.js";
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
  let disposeService: (() => void) | undefined;
  pi.registerCommand("model-roles", {
    description: "Configure model roles and automatic selection",
    getArgumentCompletions: (prefix) =>
      [
        "settings",
        "status",
        "reload",
        "pause",
        "auto",
        "auto-setup",
        "auto-setup review",
        "auto-setup cancel",
        ...Object.keys(controller.store.snapshot?.config.roles ?? {}).map((id) => `use ${id}`),
      ]
        .filter((value) => value.startsWith(prefix))
        .map((value) => ({ value, label: value })),
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
  pi.on("agent_start", (_event, ctx) => autoSetup.agentStarted(ctx));
  pi.on("agent_settled", (_event, ctx) => autoSetup.agentSettled(ctx));
  pi.on("session_tree", (_event, ctx) => {
    controller.tree(ctx);
    autoSetup.tree(ctx);
  });
  pi.on("session_shutdown", (_event, ctx) => {
    disposeService?.();
    disposeService = undefined;
    autoSetup.shutdown();
    controller.shutdown(ctx);
  });
}
