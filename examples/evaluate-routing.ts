import { evaluateRouting } from "../src/evaluation/index.js";
import { syntheticEvaluation } from "../src/evaluation/fixtures.js";

// Credential-free protocol exercise: deliberately conservative canned output, no semantic inference.
const result = await evaluateRouting({
  ...syntheticEvaluation(),
  evidence: "contract-check",
  classify: async (input) => ({
    text: JSON.stringify(
      JSON.parse(input.text).context ? { action: "classify", matches: [] } : { matches: [] },
    ),
  }),
});
console.log(
  JSON.stringify(
    { notice: "HARNESS/CONTRACT CHECK — NOT SEMANTIC BENCHMARK EVIDENCE", ...result },
    null,
    2,
  ),
);
