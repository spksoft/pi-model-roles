import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Inert compatibility entry for the withdrawn automatic-child experiment.
 * Neither environment markers nor caller-supplied bindings establish model
 * scope or a supported pre-dispatch model override on the tested host.
 */
export default function piSubagentModelRolesChild(_pi: ExtensionAPI): void {}
