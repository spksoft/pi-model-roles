import assert from "node:assert/strict";

/** Check before importing pi-subagents: its parent-owner gate is captured at module evaluation. */
export function assertNativeSubagentParentContext(
  environment: Readonly<NodeJS.ProcessEnv> = process.env,
): void {
  assert.notEqual(
    environment.PI_SUBAGENT_CHILD,
    "1",
    "Native pi-subagents integration requires a normal parent process: pi-subagents 0.65.1 " +
      "disables its event owner when imported with PI_SUBAGENT_CHILD=1. " +
      "Have the parent run node --import tsx --test test/integration/pi-subagents.test.ts " +
      "without changing inherited safety flags; do not retry delegation inside this child.",
  );
}
