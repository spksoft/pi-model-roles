import assert from "node:assert/strict";
import { test } from "node:test";
import type { AvailableModel } from "../../src/core/types.js";
import { AUTO_SETUP_LIMITS } from "../../src/auto-setup/limits.js";
import { AutoSetupValidationError, validateProposal } from "../../src/auto-setup/validation.js";

const models: AvailableModel[] = [
  {
    ref: { provider: "fixture", id: "base" },
    efforts: ["off", "high"],
    images: false,
    contextWindow: 1,
  },
  {
    ref: { provider: "fixture", id: "fast" },
    efforts: ["off", "low"],
    images: false,
    contextWindow: 1,
  },
  {
    ref: { provider: "fixture", id: "offline" },
    efforts: ["off"],
    images: false,
    contextWindow: 1,
  },
  {
    ref: { provider: "gateway", id: "unknown" },
    efforts: ["off"],
    images: false,
    contextWindow: 1,
  },
];

function proposal() {
  return {
    version: 1,
    summary: "Mixed, agent-reported evidence for tests.",
    assessments: [
      {
        model: models[0]!.ref,
        status: "official_sources_cited",
        summary: "A first-party report was cited.",
        sources: [
          {
            title: "Provider model card",
            url: "https://provider.example/models/base",
            accessedAt: "2026-01-02",
            publishedAt: "2026-01-01",
            benchmark: "SyntheticBench",
            result: "50",
            metric: "percent",
            harness: "v1",
            split: "test",
            version: "1",
          },
        ],
        caveats: ["Agent-reported source; not independently verified."],
      },
      {
        model: models[1]!.ref,
        status: "no_official_evidence_found",
        summary: "Search was attempted but no official evidence was found.",
        sources: [],
        caveats: ["No official result was located."],
      },
      {
        model: models[2]!.ref,
        status: "offline_knowledge",
        summary: "Offline knowledge only; no web evidence was obtained.",
        sources: [],
        caveats: ["Not a measured benchmark result."],
      },
      {
        model: models[3]!.ref,
        status: "identity_unresolved",
        summary: "The serving identity could not be mapped to a developer model.",
        sources: [],
        caveats: ["No guessed alias mapping was used."],
      },
    ],
    roles: [
      {
        id: "quick",
        model: models[1]!.ref,
        effort: "low",
        description: "Use for small well-specified edits.",
        rationale: "The selected model supports low effort.",
        effortRationale: "Low is one of the registry-supported efforts.",
        evidenceModels: [models[1]!.ref],
        uncertainty: "No official benchmark evidence was found.",
      },
    ],
  };
}

test("Auto Setup accepts a mixed per-model evidence report", () => {
  const result = validateProposal(proposal(), models);
  assert.equal(result.assessments.length, 4);
  assert.equal(result.roles[0]?.model.id, "fast");
  assert.equal(result.assessments[2]?.status, "offline_knowledge");
});

for (const [name, mutate, code] of [
  [
    "offline citations",
    (value: ReturnType<typeof proposal>) => {
      value.assessments[2]!.sources.push({
        title: "Not allowed",
        url: "https://example.test/source",
        accessedAt: "2026-01-01",
        publishedAt: "2026-01-01",
        benchmark: "SyntheticBench",
        result: "0",
        metric: "percent",
        harness: "v1",
        split: "test",
        version: "1",
      });
    },
    "offline_has_sources",
  ],
  [
    "guessed unsupported effort",
    (value: ReturnType<typeof proposal>) => {
      value.roles[0]!.effort = "high";
    },
    "unsupported_effort",
  ],
  [
    "unselected assignment",
    (value: ReturnType<typeof proposal>) => {
      value.roles[0]!.model = { provider: "other", id: "model" };
    },
    "unselected_model",
  ],
  [
    "custom role named default",
    (value: ReturnType<typeof proposal>) => {
      value.roles[0]!.id = "default";
    },
    "invalid_role_id",
  ],
  [
    "guessed mapping without source",
    (value: ReturnType<typeof proposal>) => {
      Object.assign(value.assessments[3]!, {
        upstream: { provider: "developer", id: "model", mappingSource: 0 },
      });
    },
    "mapping_without_source",
  ],
] as const)
  test(`Auto Setup rejects ${name}`, () => {
    const value = proposal();
    mutate(value);
    assert.throws(
      () => validateProposal(value, models),
      (error: unknown) => error instanceof AutoSetupValidationError && error.code === code,
    );
  });

test("Auto Setup rejects more than its exact source cap without truncation", () => {
  const value = proposal();
  value.assessments[0]!.sources = Array.from(
    { length: AUTO_SETUP_LIMITS.sourcesPerCandidate + 1 },
    (_, index) => ({
      title: `Source ${index}`,
      url: `https://example.test/${index}`,
      accessedAt: "2026-01-01",
      publishedAt: "2026-01-01",
      benchmark: "SyntheticBench",
      result: "0",
      metric: "percent",
      harness: "v1",
      split: "test",
      version: "1",
    }),
  );
  assert.throws(() => validateProposal(value, models), AutoSetupValidationError);
});
