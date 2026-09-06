import assert from "node:assert/strict";
import { test } from "node:test";
import { AUTO_SETUP_LIMITS } from "../../src/auto-setup/limits.js";
import {
  buildRefinementPrompt,
  buildResearchPrompt,
  proposalSubmissionGuidance,
} from "../../src/auto-setup/prompt.js";
import type { AutoSetupDraft } from "../../src/auto-setup/types.js";

const candidates = [
  {
    ref: { provider: "fixture", id: "base" },
    efforts: ["off", "high"] as const,
    images: false,
    contextWindow: 1000,
  },
  {
    ref: { provider: "fixture", id: "fast/model" },
    efforts: ["off", "low"] as const,
    images: true,
    contextWindow: 2000,
  },
];

test("research prompt preserves exact models and evidence limitations", () => {
  const prompt = buildResearchPrompt({ requestId: "12345678-test", generation: 2, candidates });
  assert.match(prompt, /fixture\/base/);
  assert.match(prompt, /fixture\/fast\/model/);
  assert.match(prompt, /Do not guess that a gateway alias/);
  assert.match(prompt, /not a sandbox/);
  assert.match(prompt, /no new role is useful/);
  assert.match(prompt, /proposal: \{ version: 1, summary, assessments, roles, default\? \}/);
  assertProposalContract(prompt);
  assert.match(prompt, /Do not add schemaVersion, kind, metadata, or routing fields/);
  assert.match(prompt, /accessedAt and publishedAt use YYYY-MM-DD/);
  assert.match(prompt, /mappingSource is that assessment's zero-based source index/);
  assert.match(prompt, /Use no other keys at any level/);
  assert.match(prompt, /generation 2/);
});

function assertProposalContract(prompt: string): void {
  assert.ok(
    prompt.includes(
      `caveats: a required array of zero to ${AUTO_SETUP_LIMITS.caveatsPerCandidate} non-empty strings, each at most ${AUTO_SETUP_LIMITS.caveat} characters; never provide a scalar string`,
    ),
  );
  assert.match(prompt, /"caveats": \["Agent-reported; not independently verified\."\]/);
  assert.ok(prompt.includes(proposalSubmissionGuidance));
  assert.match(prompt, /retry once with the same requestId and generation/);
  assert.match(prompt, /Stop after acceptance, an inactive request, or a second rejection/);
  assert.doesNotMatch(prompt, /exactly once/);
}

test("refinement prompt carries the same typed contract and correction guidance", () => {
  const draft: AutoSetupDraft = {
    version: 1,
    requestId: "12345678-test",
    baseRevision: "fixture-revision",
    candidates,
    researchModel: candidates[0]!.ref,
    receivedAt: "2026-01-02T00:00:00.000Z",
    proposal: {
      version: 1,
      summary: "Synthetic offline report.",
      assessments: candidates.map(({ ref }) => ({
        model: ref,
        status: "offline_knowledge",
        summary: "No web evidence was collected.",
        sources: [],
        caveats: ["Not measured evidence."],
      })),
      roles: [],
    },
  };
  const prompt = buildRefinementPrompt({
    requestId: draft.requestId,
    generation: 3,
    draft,
    question: "Would any new role be useful?",
  });
  assertProposalContract(prompt);
  assert.match(prompt, /generation 3/);
  assert.match(prompt, /prior reviewed draft stays available/);
  assert.ok(prompt.includes(JSON.stringify(draft.proposal)));
});
