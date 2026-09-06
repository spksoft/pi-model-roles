import assert from "node:assert/strict";
import { test } from "node:test";
import { hasStartupChoice } from "../../src/pi/startup-choice.js";
import type { Effort, ModelRef, SelectionDecision } from "../../src/core/types.js";

test("startup pins only use actual Pi value-bearing options", () => {
  for (const flag of ["--model", "--provider", "--thinking"])
    assert.equal(hasStartupChoice([flag, "fixture"]), true);
  for (const args of [
    [],
    ["Task mentions --model fixture"],
    ["--", "--model", "fixture"],
    ["--system-prompt", "--model"],
    ["--model"],
    ["--extension", "--thinking"],
  ])
    assert.equal(hasStartupChoice(args), false);
  // Pi 0.85.1's argv parser does not support GNU --model=value syntax.
  assert.equal(hasStartupChoice(["--model=fixture"]), false);
});

// These must fail typechecking: public contracts reject incomplete references/decisions.
// @ts-expect-error unsupported effort
const effort: Effort = "turbo";
// @ts-expect-error provider is required
const model: ModelRef = { id: "fixture" };
// @ts-expect-error selected decisions require model and effort
const decision: SelectionDecision = {
  status: "selected",
  reason: "matched",
  fallback: false,
  warnings: [],
};
void [effort, model, decision];
