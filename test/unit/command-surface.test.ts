import assert from "node:assert/strict";
import { test } from "node:test";
import { modelRoleCommandCompletions } from "../../src/extension.js";

test("model-roles completion exposes settings, one selector toggle, configured roles, and run", () => {
  assert.deepEqual(modelRoleCommandCompletions(true, ["default", "quick"], ""), [
    { value: "settings", label: "Settings" },
    { value: "disable", label: "Disable Auto Selector" },
    { value: "use default", label: "Use default" },
    { value: "use quick", label: "Use quick" },
    { value: "run", label: "Run command with model routing" },
    { value: "context", label: "Choose selector context (with consent)" },
    { value: "selector", label: "Choose independent selector profile" },
    { value: "context-session", label: "Session context override (process only)" },
    { value: "why", label: "Explain the last selection" },
  ]);
  assert.deepEqual(modelRoleCommandCompletions(false, ["default"], ""), [
    { value: "settings", label: "Settings" },
    { value: "enable", label: "Enable Auto Selector" },
    { value: "use default", label: "Use default" },
    { value: "run", label: "Run command with model routing" },
    { value: "context", label: "Choose selector context (with consent)" },
    { value: "selector", label: "Choose independent selector profile" },
    { value: "context-session", label: "Session context override (process only)" },
    { value: "why", label: "Explain the last selection" },
  ]);
  assert.deepEqual(modelRoleCommandCompletions(true, ["default", "quick"], "use q"), [
    { value: "use quick", label: "Use quick" },
  ]);
  assert.deepEqual(modelRoleCommandCompletions(true, ["default"], "ru"), [
    { value: "run", label: "Run command with model routing" },
  ]);
});
