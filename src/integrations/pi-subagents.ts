import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Effort, ModelRef } from "../core/types.js";

export const PI_SUBAGENT_ROUTING_UNSUPPORTED = "automatic_child_routing_unsupported";

export interface PiSubagentRoutingDiagnostic {
  status: "unsupported";
  code: typeof PI_SUBAGENT_ROUTING_UNSUPPORTED;
  message: string;
}

export interface PiSubagentRoutingRequest {
  /** Pins remain the launcher's responsibility; this diagnostic never inspects or changes them. */
  model?: ModelRef;
  effort?: Effort;
}

/** No registration, RPC, provider call, timer, or child launch is performed. */
export function piSubagentRoutingDiagnostic(
  _request: PiSubagentRoutingRequest = {},
): PiSubagentRoutingDiagnostic {
  return {
    status: "unsupported",
    code: PI_SUBAGENT_ROUTING_UNSUPPORTED,
    message:
      "Automatic child routing is unsupported on the tested Pi 0.85.1 / pi-subagents 0.65.1 contracts: context runs after model/effort capture, and child model-scope authority is not available to this extension. No child was registered or launched. Use selectViaEvents before your existing launcher, preserving resolved model/effort pins and allowed-model restrictions; the launcher remains authoritative.",
  };
}

/**
 * Fail-closed compatibility probe for the withdrawn background bridge.
 * A present RPC owner or a caller-supplied binding does not establish safe
 * per-turn model switching and scope propagation. Never emit a spawn request.
 */
export async function createPiSubagentsBackgroundBridge(
  _pi: Pick<ExtensionAPI, "events">,
): Promise<PiSubagentRoutingDiagnostic> {
  return piSubagentRoutingDiagnostic();
}
