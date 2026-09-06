import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { AUTO_SETUP_TOOL, type AutoSetupController } from "../pi/auto-setup-controller.js";

const proposalSchema = Type.Object(
  {
    requestId: Type.String({ minLength: 8, maxLength: 128 }),
    generation: Type.Integer({ minimum: 1 }),
    proposal: Type.Unknown(),
  },
  { additionalProperties: false },
);

/** Registers a handoff that is deliberately incapable of saving role configuration. */
export function registerAutoSetupTool(pi: ExtensionAPI, controller: AutoSetupController): void {
  pi.registerTool({
    name: AUTO_SETUP_TOOL,
    label: "Submit Auto Setup proposal",
    description:
      "Submit one complete, structured pi-model-roles Auto Setup research proposal for the currently active request. This only stores a draft for user review; it never saves configuration.",
    promptSnippet: "Submit the current Auto Setup proposal after research is complete.",
    promptGuidelines: [
      "Use model_roles_submit_auto_setup_proposal exactly once only when an active Auto Setup request asks for it; it stores a review draft and never applies configuration.",
    ],
    parameters: proposalSchema,
    executionMode: "sequential",
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = controller.submit(ctx, params);
      return result.ok
        ? {
            content: [
              {
                type: "text" as const,
                text: "Auto Setup proposal accepted. Continue only if the user requested normal discussion; the review becomes available after the agent settles.",
              },
            ],
            details: { accepted: true },
          }
        : {
            content: [{ type: "text" as const, text: result.reason }],
            details: { accepted: false },
            isError: true,
          };
    },
  });
}
