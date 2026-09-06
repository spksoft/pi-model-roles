import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clampThinkingLevel,
  fauxProvider,
  getSupportedThinkingLevels,
} from "@earendil-works/pi-ai";
import { serializeConfig } from "../../src/config/codec.js";
import { defaultConfig } from "../../src/core/defaults.js";
import { selectModelForTask } from "../../src/core/selection.js";
import { EFFORTS } from "../../src/core/types.js";
import { BASE, dependencies, request } from "../support/fixtures.js";

test("encoded YAML cannot exceed the read limit even when every individual field is valid", () => {
  const config = defaultConfig();
  for (let i = 0; i < 31; i++)
    config.roles[`role${i}`] = { model: BASE, effort: "low", description: "\u0001".repeat(2000) };
  assert.throws(() => serializeConfig(config), /file_too_large/);
});

test("provider-independent effort normalization agrees with Pi's capability helper", async () => {
  const faux = fauxProvider({
    provider: "fixture",
    models: [
      { id: "default", reasoning: true },
      { id: "off-only", reasoning: false },
    ],
  });
  for (const original of faux.models)
    for (const effort of EFFORTS) {
      const model = {
        ...original,
        thinkingLevelMap: { minimal: null, medium: null, xhigh: null, max: null },
      };
      const deps = dependencies();
      deps.config = defaultConfig();
      deps.config.roles.default.effort = effort;
      deps.models = () => [
        {
          ref: { provider: model.provider, id: model.id },
          efforts: getSupportedThinkingLevels(model),
          images: true,
          contextWindow: 200000,
        },
      ];
      const decision = await selectModelForTask(
        request({ baseline: { model: { provider: model.provider, id: model.id }, effort: "off" } }),
        deps,
      );
      assert.equal(decision.status, "selected");
      if (decision.status === "selected")
        assert.equal(decision.effort, clampThinkingLevel(model, effort));
    }
});
