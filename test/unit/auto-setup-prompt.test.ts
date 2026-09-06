import assert from "node:assert/strict";
import { test } from "node:test";
import { buildResearchPrompt } from "../../src/auto-setup/prompt.js";

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
  assert.match(prompt, /generation 2/);
});
