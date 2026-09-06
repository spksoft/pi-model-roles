import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultConfig } from "../../src/core/defaults.js";
import { isModelRef, sameModel } from "../../src/core/model-identity.js";
import type { Effort, SelectionDecision } from "../../src/core/types.js";
test("default is inherited, fresh, and exact model identity preserves slash IDs", () => {
  const a = defaultConfig();
  a.enabled = false;
  assert.equal(defaultConfig().enabled, true);
  assert.deepEqual(Object.keys(a.roles), ["default"]);
  assert.equal(isModelRef({ provider: "fixture", id: "owner/model" }), true);
  assert.equal(sameModel({ provider: "a", id: "same" }, { provider: "b", id: "same" }), false);
});
// Compile-time contract checks, never provider inputs.
// @ts-expect-error Unknown effort is forbidden.
const badEffort: Effort = "ultra";
// @ts-expect-error Selected decisions require an exact model and effort.
const badDecision: SelectionDecision = {
  status: "selected",
  reason: "matched",
  fallback: false,
  warnings: [],
};
void badEffort;
void badDecision;
