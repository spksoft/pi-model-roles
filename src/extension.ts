import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerSelectionService } from "./api/events.js";
import { ConfigStore } from "./config/store.js";
import { RolesController } from "./pi/controller.js";
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
        ...Object.keys(controller.store.snapshot?.config.roles ?? {}).map((id) => `use ${id}`),
      ]
        .filter((value) => value.startsWith(prefix))
        .map((value) => ({ value, label: value })),
    handler: (args, ctx) => handleCommand(controller, args, ctx),
  });
  pi.on("session_start", async (event, ctx) => {
    disposeService?.();
    await controller.start(ctx, event.reason);
    if (controller.active)
      disposeService = registerSelectionService(
        pi.events,
        ctx.sessionManager.getSessionId(),
        (request) => controller.select(ctx, request),
      );
  });
  pi.on("input", (event, ctx) => controller.input(event, ctx));
  pi.on("model_select", (_event, ctx) => controller.externalChange(ctx, "model"));
  pi.on("thinking_level_select", (_event, ctx) => controller.externalChange(ctx, "effort"));
  pi.on("session_tree", (_event, ctx) => controller.tree(ctx));
  pi.on("session_shutdown", (_event, ctx) => {
    disposeService?.();
    disposeService = undefined;
    controller.shutdown(ctx);
  });
}
