import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultConfig } from "../../src/core/defaults.js";
import { mergeProposal } from "../../src/auto-setup/merge.js";
import type { AutoSetupProposal } from "../../src/auto-setup/types.js";

const base = { provider: "fixture", id: "base" };
const fast = { provider: "fixture", id: "fast" };

function proposal(): AutoSetupProposal {
  return {
    version: 1,
    summary: "Synthetic proposal.",
    assessments: [],
    roles: [
      {
        id: "quick",
        model: fast,
        effort: "low",
        description: "Use for small mechanical work.",
        rationale: "Synthetic fixture.",
        effortRationale: "Low is supported.",
        evidenceModels: [fast],
        uncertainty: "Synthetic.",
      },
    ],
  };
}

test("merge preserves top-level settings and untouched unavailable roles", () => {
  const config = defaultConfig();
  config.enabled = false;
  config.selectorTimeoutMs = 12000;
  config.roles.legacy = {
    model: { provider: "missing", id: "removed" },
    effort: "high",
    description: "Existing unavailable role.",
  };
  const result = mergeProposal(config, proposal(), { mode: "keep" });
  assert.equal(result.config.enabled, false);
  assert.equal(result.config.selectorTimeoutMs, 12000);
  assert.deepEqual(result.config.roles.legacy, config.roles.legacy);
  assert.deepEqual(result.changedAssignments, [{ model: fast, effort: "low" }]);
});

test("merge requires an explicit replacement for role ID conflicts", () => {
  const config = defaultConfig();
  config.roles.quick = {
    model: base,
    effort: "high",
    description: "Existing role.",
  };
  const kept = mergeProposal(config, proposal(), { mode: "keep" });
  assert.deepEqual(kept.config.roles.quick, config.roles.quick);
  const replaced = mergeProposal(config, proposal(), {
    mode: "replace-selected",
    replaceIds: ["quick"],
  });
  assert.deepEqual(replaced.config.roles.quick?.model, fast);
  assert.equal(replaced.changes.find((change) => change.id === "quick")?.kind, "replace");
});

test("replace-custom lists deletions but leaves default unless explicitly accepted", () => {
  const config = defaultConfig();
  config.roles.legacy = { model: base, effort: "high", description: "Legacy role." };
  const result = mergeProposal(config, proposal(), { mode: "replace-custom" });
  assert.equal(result.config.roles.legacy, undefined);
  assert.equal(result.config.roles.default.model, "inherit");
  assert.ok(result.changes.some((change) => change.id === "legacy" && change.kind === "delete"));
});

test("all Auto Setup merge choices preserve independent selector profile and global context", () => {
  for (const mode of ["keep", "replace-selected", "replace-custom"] as const) {
    const config = {
      ...defaultConfig(),
      selector: { model: { provider: "missing", id: "owner/selector" }, effort: "low" as const },
      selectorContext: "conversation" as const,
    };
    const result = mergeProposal(config, proposal(), { mode });
    assert.deepEqual(result.config.selector, config.selector);
    assert.notEqual(result.config.selector, config.selector);
    assert.equal(result.config.selectorContext, "conversation");
  }
});
