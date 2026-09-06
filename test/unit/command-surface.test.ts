import assert from "node:assert/strict";
import { test } from "node:test";
import { modelRoleCommandCompletions } from "../../src/extension.js";

test("model-roles completion exposes only settings, one selector toggle, and configured roles", () => {
  assert.deepEqual(modelRoleCommandCompletions(true, ["default", "quick"], ""), [
    { value: "settings", label: "Settings" },
    { value: "disable", label: "Disable Auto Selector" },
    { value: "use default", label: "Use default" },
    { value: "use quick", label: "Use quick" },
  ]);
  assert.deepEqual(modelRoleCommandCompletions(false, ["default"], ""), [
    { value: "settings", label: "Settings" },
    { value: "enable", label: "Enable Auto Selector" },
    { value: "use default", label: "Use default" },
  ]);
  assert.deepEqual(modelRoleCommandCompletions(true, ["default", "quick"], "use q"), [
    { value: "use quick", label: "Use quick" },
  ]);
});
