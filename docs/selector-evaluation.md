# Selector improvements and evidence

[README](../README.md) · [Configuration](configuration.md) · [API](api.md) · [Compatibility](compatibility.md)

This is the current remediation status for the dated [Pi/OMP comparison](research/pi-model-roles-vs-omp-pros-cons.md), not a claim of perfection or superiority. Pi still owns execution, compaction and model application.

## Cons → remediation → evidence

| Concern | Status and evidence |
| --- | --- |
| Default executor doubles as selector | **Fixed coupling:** optional exact independent selector profile, separate optional effort, choose/reset consent, no selector-provider retry. `selector-profile.test.ts` unit and SDK tests cover legacy absence, identity, scope, explicit pins, images, unavailable/unsupported selector, timeout/cancellation and real Responses transport forwarding. No cheap-model default. |
| Extra latency/cost | **Mitigated, savings unmeasured:** independent profile permits a reviewed alternative. One request can remain per eligible task. Default-only/direct-role/manual bypasses remain. Optional equivalent-pair shortcut is deferred: avoiding a request must also preserve future role-continuation semantics. Bare “continue” never skips semantic classification. No prompt/history caching. |
| Incomplete/misleading context | **Mitigated:** separate projection versus selector-budget trimming, category observations, partial counts and unknown summary freshness. `routing-context.test.ts` covers Unicode, retained tails, exclusions and strict payload separation. No relevance retrieval, summarizer, raw tool output/reasoning or final-provider-payload visibility. |
| Coarse privacy scope | **Improved:** explicit logical-session process override and effective/global display. `context-session.test.ts` uses real SDK reload/tree/replacement/revisit/fork; `context-policy.test.ts` covers same-key sharing, isolation and capacity. No file writes for the override. Visible secrets and unmarked templates may remain; restart expires opt-outs. |
| Execution context pressure | **Advisory only:** host token estimate divided by selected advertised window; unknown is valid. Not a tokenizer/capacity/quality guarantee or compaction control. |
| Semantic accuracy and contextual benefit | **Unmeasured:** bounded adapter-driven paired facility below, diverse labelled synthetic cases. Canned replies test contracts only. No live provider calls were authorized for this implementation. |
| Narrow lifecycle, automatic children, non-atomic switching | **Host-constrained:** idle input, explicit `requestedRole`, v1 event API and explicit pre-launch examples remain. No automatic phase/tool-turn/child routing. Already-started Pi `setModel` cannot be cancelled atomically. |
| OMP comparison / reviewer cost or exposure | **Unmeasured trade-offs:** no OMP modifications or replacement harness. This work cannot rank overall quality, privacy or total workflow costs. |
| Human visual terminal acceptance | **Not run:** [manual checklist](../test/manual/tui-checklist.md) remains separate from fake-UI tests. |

## Credential-free contract demo

From a development checkout with dependencies installed:

```sh
npm run typecheck
npm run evaluate:demo
```

The demo uses 16 synthetic labelled cases, paired prompt/conversation routes and a fixed-pair baseline. Its adapter deliberately returns empty matches in the correct protocol. **HARNESS/CONTRACT CHECK — NOT SEMANTIC BENCHMARK EVIDENCE** appears in the JSON output. A low or high agreement number here is not a model-quality result. No provider is loaded, no credentials are read, and no tasks are executed. Only synthetic fixture text reaches this adapter.

Cases include a localized edit sequence, task change, ambiguous antecedent, planning→implementation, Spanish and Thai, truncated/conflicting summaries, explicit/manual/requested-role choices, unavailable models, image constraints, empty scope and a synthetic privacy sentinel. Timeout, suite deadline and in-flight/pre-start cancellation are separate harness tests with controlled adapters. These are labelled test inputs, not a representative production workload or externally adjudicated benchmark.

## Reusable evaluation contract

`evaluateRouting(input)` is exported from `pi-model-roles/evaluation`. Synthetic fixtures are separate at `pi-model-roles/evaluation/fixtures`; neither is loaded by the root extension.

Required input:

- `cases`: 1–100 reviewed synthetic cases. Each has a unique `id`, `request`, strict `context`, `acceptable` model/effort pairs, optional `models` availability snapshot and optional `sequence` ID. IDs match `[a-z][a-z0-9_-]{0,47}`; never use private labels/paths. Up to 32 acceptable pairs; empty means an unavailable outcome is expected (not cancellation). Request/model/context constraints are validated before adapter calls.
- `config`, cached `models`, and `fixed: {model, effort}` baseline. Exact identity/effort, scope and image requirements are enforced. The fixed baseline respects explicit/manual/requested-role/disabled precedence and otherwise attempts exactly that fixed pair; an invalid baseline is unavailable, never silently substituted. Neither baseline nor paired routes executes work.
- `classify(ClassifierInput): Promise<ClassifierOutput>`: explicitly supplied adapter receiving real task/role/context text and the selected exact model/optional effort, system protocol, signal and output cap. It receives no case ID, labels or acceptable answers. The caller owns authentication, provider scope, informed consent and faithful effort forwarding.
- `evidence`: required `contract-check` or `caller-adapter-trial`. This is a caller declaration, not independent certification that inference happened.

Optional controls and defaults:

| Option | Default and hard bound |
| --- | --- |
| `maxCalls` | 200; integer 1–200. Require `2 × cases.length <= maxCalls` before starting (a conservative reservation; bypasses can use fewer). |
| `callTimeoutMs` | 8,000; integer 1–60,000. Also subject to configured selector deadline. Includes selection/authentication waiting. |
| `suiteTimeoutMs` | 600,000; integer 1–600,000. Scheduling stops on deadline. |
| `signal` | Absent; optional caller cancellation. Case request signals are also honored. |
| Concurrency | Fixed **1**; no concurrency option. At most one awaited selection at a time. |

All cases are visited in source order, each in prompt/conversation/fixed order. Within a named sequence, each mode carries its own prior executable model/effort forward unless the case pins/manual state override it. Contextual previous-role evidence comes from that mode's prior decision, not fabricated fixture labels. The fixture history itself stays the same for each paired case; no actual execution transcript is generated. Independent cases have no cross-case switching comparison. Unavailable outcomes do not replace the prior executable comparison pair.

The outer deadline is the minimum of the requested call timeout, configured `selectorTimeoutMs`, and remaining suite time, registered before selection so unavailable fallback cannot hide a timeout. A timeout or cancellation stops the entire suite immediately, without scheduling replacement calls or completing the remaining pair. Results can therefore be partial: compare modes only on common completed case IDs. An adapter ignoring AbortSignal may keep working externally after local timeout; the harness cannot reverse transmission, effects or charges. Adapters must not spawn unbounded retries/subcalls. The hard call count bounds adapter invocations, not undocumented internal provider retries. No network discovery occurs in the harness.

## Results and honest interpretation

Machine-readable JSON includes version, declared evidence, calls, fixed concurrency, stop category, per-case/mode rows and per-mode metrics. Rows contain only synthetic IDs, allowlisted statuses/reasons, agreement, fallback, switch/constraint flags, measured selector duration and supplied numeric usage/cost when available. No prompts/history, raw replies, provider exception strings, credential configuration, or model-generated explanations appear.

- **Acceptable agreement:** fraction of completed rows matching a predeclared executable pair, or unavailable when the acceptable set is empty. Cancellation is not agreement.
- **Fallback/timeout/cancellation rates:** observed rows using those policy outcomes, not estimates for unscheduled cases. Empty mode denominators are `null`.
- **Switches:** changes between executable pairs within the same labelled sequence and mode, not a claim of unnecessary or unsafe switching.
- **Constraint violations:** executable result outside advertised model/effort, scope, image support, explicit model/effort or declared manual/disabled pair constraints. This is a mechanical diagnostic, **not observed harm**. Unacceptable decisions are counted separately and may reflect disputed labels.
- **Selector time:** measured wall time around classification; timeout/cancellation rows retain elapsed selector waiting when a call started. No-invocation rows omit time. Timing is noisy and selector-only.
- **Usage/cost:** only valid nonnegative adapter-supplied `{input, output, totalTokens, cost}` values; absence stays absent. No inferred price or total execution cost. Rows allow aggregation with your chosen cost units; supplied costs must use one disclosed unit to compare them.

`executionQualityMeasured: false` and `totalExecutionCostMeasured: false` are always explicit. The harness does not evaluate task completion, errors during execution, real user harm, total agent tokens or tool costs. A fixed-model baseline here is a **routing-decision baseline**, not an executed workload baseline.

## Explicit real-adapter trial (not run here)

Build locally or install a prebuilt package, then create your own ESM script. Keep the adapter module private and never log its configuration. No live adapter is bundled or auto-loaded:

```js
import { evaluateRouting } from "pi-model-roles/evaluation";
import { syntheticEvaluation } from "pi-model-roles/evaluation/fixtures";
import { classify, reviewedConfig, eligibleModels, fixedPair, quickPair } from "./my-consented-adapter.mjs";

const fixtures = syntheticEvaluation();
// The adapter module explicitly supplies two reviewed pairs and config.roles.quick.
// No automatic cheap-model choice: mapping is a caller decision, not discovery.
const pairFor = (ref) => ref.id === "general" ? fixedPair : quickPair;
const cases = fixtures.cases.map((item) => ({
  ...item,
  request: {
    ...item.request,
    baseline: pairFor(item.request.baseline.model),
    current: pairFor(item.request.current.model),
    ...(item.request.explicitModel ? {
      explicitModel: pairFor(item.request.explicitModel).model,
      explicitEffort: pairFor(item.request.explicitModel).effort,
    } : {}),
    ...(item.request.allowedModels ? {
      allowedModels: item.request.allowedModels.map((ref) => pairFor(ref).model),
    } : {}),
  },
  acceptable: item.acceptable.map((pair) => pairFor(pair.model)),
  ...(item.models ? { models: item.models.map((model) => {
    const ref = pairFor(model.ref).model;
    const eligible = eligibleModels.find((m) => m.ref.provider === ref.provider && m.ref.id === ref.id);
    if (!eligible) throw new Error("reviewed_model_unavailable");
    return eligible;
  }) } : {}),
}));
const result = await evaluateRouting({
  cases, config: reviewedConfig, models: eligibleModels, fixed: fixedPair,
  classify, evidence: "caller-adapter-trial", maxCalls: 32,
  callTimeoutMs: 8000, suiteTimeoutMs: 120000,
  signal: AbortSignal.timeout(120000),
});
console.log(JSON.stringify(result));
```

Run only after the separate approval: `node my-trial.mjs`. This module must have the installed/built evaluation exports available.

`classify(input)` must make real inference using `input.model`, `input.systemPrompt`, `input.text`, `input.maxTokens`, optional `input.effort`, and cancellation; return `{text, usage?}`. Do not add execution tools, personal conversation or raw reasoning. This example requires an intentional invocation and reviewed identity mapping; it is not a turnkey request against personal providers. Use a maximum of 32 calls for the 16-case set. An explicitly approved adapter can instead use its own bounded labelled cases.

### Future paired-evidence checklist

- [ ] Obtain provider/data/cost consent; use synthetic or separately reviewed non-sensitive text only.
- [ ] Predeclare acceptable decisions and adjudicate disputed/ambiguous cases independently of model outputs.
- [ ] Record exact selector/executor identities, effort mapping, provider/host versions, configuration, model availability and evaluation code revision without secrets.
- [ ] Run real inference through the explicit adapter, not canned JSON; disclose repetitions, order effects, timeouts, partial pairs and selector-only measurement.
- [ ] Compare common completed case IDs, per-category agreement, fallback, constraint violations, switching and measured selector latency/usage/cost; report denominators and uncertainty, not just averages.
- [ ] Separately obtain approval for actual task execution and measure completion quality, failures, tool/compaction costs and total execution time against a fixed model under the same conditions.
- [ ] Perform human TUI acceptance in a disposable environment. Do not claim broader Pi/provider compatibility or atomic switching from fake-provider tests.

Evaluation IDs and sequence IDs must be primitive synthetic-label strings, not coercible objects. Malformed input/case/model/fixed/acceptable records or optional AbortSignals are rejected as `invalid_evaluation_input` before adapter invocation; raw values are not included in the error or result rows.
