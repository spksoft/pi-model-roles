import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeProposal } from "../../src/auto-setup/merge.js";
import { autoSetupConfigDiff, autoSetupReport } from "../../src/auto-setup/report.js";
import type { AutoSetupDraft, AutoSetupProposal } from "../../src/auto-setup/types.js";
import { validateProposal } from "../../src/auto-setup/validation.js";
import { defaultConfig } from "../../src/core/defaults.js";

const model = { provider: "fixture", id: "owner/model" };
const candidate = {
  ref: model,
  efforts: ["low", "high"] as const,
  contextWindow: 32000,
  images: true,
};

function proposal(): AutoSetupProposal {
  return {
    version: 1,
    summary: "Synthetic balanced proposal; not a measured ranking.",
    assessments: [
      {
        model,
        status: "official_sources_cited",
        summary: "Synthetic source record for display tests only.",
        sources: [
          {
            title: "Synthetic model card",
            url: "https://example.com/model-card",
            accessedAt: "2026-01-02",
            publishedAt: "2026-01-01",
            benchmark: "Synthetic benchmark",
            result: "Synthetic result",
            metric: "Synthetic metric",
            harness: "Synthetic harness",
            split: "Synthetic split",
            version: "Synthetic version",
          },
        ],
        caveats: ["Not independently verified."],
        upstream: { provider: "developer", id: "upstream/model", mappingSource: 0 },
      },
    ],
    roles: [
      {
        id: "quick",
        model,
        effort: "low",
        description: "Use when a localized low-risk edit has a known outcome and no diagnosis.",
        rationale: "Synthetic match: fix a typo; near-miss: diagnose an unknown failure.",
        effortRationale: "Low effort is provisional without workload measurements.",
        evidenceModels: [model],
        uncertainty: "Synthetic assessment only.",
        tradeoff: "High effort may help uncertain tasks at additional latency.",
      },
    ],
    default: {
      model,
      effort: "high",
      rationale: "Synthetic general-task and selector reliability justification.",
      effortRationale: "High default effort trades latency for reliability; not measured.",
      evidenceModels: [model],
      uncertainty: "No measured selector latency.",
      tradeoff: "Selector overhead also affects routine tasks.",
    },
  };
}

function draft(report = proposal()): AutoSetupDraft {
  return {
    version: 1,
    requestId: "12345678-test",
    baseRevision: "fixture-revision",
    candidates: [candidate],
    researchModel: model,
    receivedAt: "2026-01-02T00:00:00.000Z",
    proposal: validateProposal(report, [candidate]),
  };
}

test("review shows effort, trade-offs, default impact, and complete source conditions", () => {
  const value = draft();
  const text = autoSetupReport(value);
  for (const source of value.proposal.assessments[0]!.sources)
    for (const field of Object.values(source)) assert.ok(text.includes(field));
  assert.match(text, /Claimed upstream: developer\/upstream\/model \(mapping source \[1\]\)/);
  for (const item of [...value.proposal.roles, value.proposal.default!]) {
    for (const field of [item.rationale, item.effortRationale, item.uncertainty, item.tradeoff!])
      assert.ok(text.includes(field));
  }
  assert.match(text, /Suggested default: fixture\/owner\/model · high/);
  assert.match(text, /also affects the selector/);
  assert.match(text, /Evidence models: fixture\/owner\/model/);
  assert.match(text, /design checks, not measured accuracy/);
  assert.match(text, /Review retained roles for overlap/);
});

test("review handles no recommendations and offline evidence without invented details", () => {
  const value = proposal();
  value.roles = [];
  delete value.default;
  value.assessments = [
    { model, status: "offline_knowledge", summary: "No web evidence.", sources: [], caveats: [] },
  ];
  const text = autoSetupReport(draft(value));
  assert.match(text, /No new custom roles recommended/);
  assert.match(text, /Keep existing default \(no replacement proposed\)/);
  assert.match(text, /No source URL reported/);
  assert.doesNotMatch(text, /undefined|Suggested default:|Claimed upstream:|benchmark:/);
});

test("confirmation diff shows exact merged values and omits kept conflicts/default", () => {
  const before = defaultConfig();
  before.roles.quick = {
    model,
    effort: "high",
    description: 'Use when a synthetic task says "before".\nSecond line.',
  };
  const value = proposal();
  const kept = mergeProposal(before, value, { mode: "keep" });
  assert.equal(autoSetupConfigDiff(before, kept.config), "");
  const replaced = mergeProposal(before, value, {
    mode: "replace-selected",
    replaceIds: ["quick"],
    replaceDefault: true,
  });
  const diff = autoSetupConfigDiff(before, replaced.config);
  assert.match(diff, /replace: default/);
  assert.match(diff, /replace: quick/);
  assert.match(diff, /"model":"inherit","effort":"inherit"/);
  assert.ok(diff.includes(JSON.stringify(before.roles.quick.description)));
  assert.ok(diff.includes(JSON.stringify(value.roles[0]!.description)));
  assert.match(diff, /"effort":"low"/);
  assert.match(diff, /"effort":"high"/);
  assert.doesNotMatch(diff, /\nSecond line\./);
  assert.equal(before.roles.default.model, "inherit");
});

test("replace-all diff coalesces delete/re-add and includes removed roles", () => {
  const before = defaultConfig();
  before.roles.quick = { model, effort: "high", description: "Use when synthetic old criteria." };
  before.roles.retired = { ...before.roles.quick };
  const value = proposal();
  value.roles.push({ ...value.roles[0]!, id: "added" });
  const merged = mergeProposal(before, value, { mode: "replace-custom" });
  const diff = autoSetupConfigDiff(before, merged.config);
  assert.match(diff, /add: added\n  Before: \(absent\)/);
  assert.match(diff, /delete: retired/);
  assert.match(diff, /After: \(absent\)/);
  assert.equal(diff.match(/replace: quick/g)?.length, 1);
  assert.doesNotMatch(diff, /add: quick|delete: quick|replace: default/);
});
