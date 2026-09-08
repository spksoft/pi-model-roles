# Is the new pi-model-roles implementation better than OMP?

> Historical comparison: see [current remediation status and evidence](../selector-evaluation.md). Later upgrades mitigate some concerns; semantic superiority, end-to-end cost/quality and host-constrained lifecycle gaps are not claimed solved.

**Independent technical/product assessment — 2026-09-08**

## Executive answer

**Yes for a narrower design fit; not yet for demonstrated results; no as a blanket replacement.** If your goal is “stay in Pi, interpret conversational follow-ups, and automatically choose a configured execution model and effort,” the new implementation addresses that goal more directly than the inspected OMP mechanisms. Its opt-in conversation selector can use recent dialogue to interpret “implement that,” distinguish continuation from changed intent, and choose task-based roles. OMP's inspected automatic-thinking path instead classifies the current expanded prompt into **effort for the active model**.

**Prefer OMP when explicit planning transitions, integrated task/advisor models, and broader session/settings control matter more than semantic main-model routing.** Nothing inspected proves that pi-model-roles produces better code, lower total cost, lower latency, or more accurate decisions. Recommend a controlled trial of the extension for your conversational-routing goal—not migration from OMP solely on this report.

## 1. Scope and evidence

This compares a **lightweight Pi routing extension** with **OMP's integrated coding-agent harness**, specifically their model-selection, context, effort, and control mechanisms. It is not an overall coding-agent feature contest. “Lightweight” describes integration scope, not measured memory, startup time, or inference cost.

| Item | Version/evidence | What it establishes |
| --- | --- | --- |
| Local implementation | Supplied branch `main`, base HEAD `f35901ad961940136796bd8a05c151f36b64d271`, **plus current uncommitted working files and additions** | Actual source/tests were read, not just old HEAD. This snapshot has no independent commit identifier. |
| Local host boundary | Documented Pi **0.85.1**; optional pi-subagents **0.65.1** | Compatibility scope, not universal Pi/runner support. |
| Local verification | Parent-completed `npm run check`; log `/tmp/pi-model-roles-check-final.log`; **93 unit and 118 integration/package tests passed** | Formatting, lint, typecheck, build, and synthetic behavior. Not live semantic accuracy or a comparison benchmark. |
| OMP | GitHub `commits/main` resolved during research to `daf07999c2fee9b22edc7bf8fea1fb6272e0df5e`, dated **2026-09-07 18:00:19 UTC**, version-bump commit **18.1.14** [O0] | Same pin as historical research, now independently re-resolved; focused pinned sources re-fetched. Not a perpetual “latest” claim. |
| Historical local report | `omp-model-roles-context-and-save-reliability.md` | Discovery/context only. Its missing-context and toggle-bug findings describe the pre-implementation state. |

**Evidence labels:** direct = inspected code/test or explicitly attributed first-party documentation; interpretation = design implication; unknown = unmeasured outcome. Confidence is high in the narrow code distinctions, medium in product-fit judgments, and insufficient for performance superiority. Search summaries were discovery aids. An automated `source_check` of the central OMP distinction returned **unclear** and older source hits; the conclusion instead rests on direct inspection of the pinned classifier, call site, and resolver. No OMP execution or live-model benchmark was performed.

## 2. What actually changed locally

**Direct evidence, high confidence:** `src/pi/controller.ts::routeSubmission` now optionally calls `projectRoutingContext(buildContextEntries(), previousRole)` and the separate `selectModelWithContext` core API. The projection includes retained active-branch user/assistant text and existing compaction/branch summaries, including materialized `retainedTail`. Limits are **12 messages, 16 KiB UTF-8 text total, 4 KiB each**. Recent entries take priority; additional oldest history can be dropped for selector budget. This is **not full history, relevance retrieval, or the final execution payload**. [L1–L2]

The contextual protocol offers `classify` or `continue`. Its prompt instructs the selector to reclassify planning-to-implementation, new deliverables, changed risk, and unrelated tasks. Deterministic code permits continuation only with nonempty history and a previous role whose currently eligible model/effective effort exactly match the active pair. Explicit pins, manual pause, scope, and image eligibility remain authoritative. **Whether continuation is appropriate remains model judgment; the guards do not semantically guarantee sameness.** [L1]

Toggle recovery also changed materially. Both commands pause locally first. Disable remains effective if persistence fails; enable resumes only after a successful durable update and an unchanged session guard. `ConfigStore.setEnabled` reads fresh disk state under the lock and changes only that field; ordinary role/context drafts retain revision checks. Committed saves are distinguished from subsequent UI failures. These address the earlier local failure modes, not an established OMP weakness. [L3]

## 3. Capability and trade-off matrix

| Dimension | New pi-model-roles | Inspected OMP | Assessment |
| --- | --- | --- | --- |
| Main-model assignment | Semantic matching against configured task descriptions; one clear match wins, ambiguity uses default | Named built-in/custom assignments, aliases/patterns, explicit mode/subsystem resolution [O1–O2] | Extension more directly targets conversational main-model choice. |
| Selector context | Prompt-only default; opt-in bounded dialogue/summaries | Auto-thinking receives current `expandedText`, then lossy preprocessing [O4–O6] | Extension supplies historical referents; OMP sees current expansion. Neither proves full-history main-model selection. |
| Continuing work | Model-requested retention plus deterministic eligibility | Active model persists absent another control/transition; auto-thinking may adjust effort | OMP continuity needs no semantic main-model reselection; extension can also identify new tasks, but can misjudge. |
| Planning | No owned planning lifecycle; raw template invocation can route | Plan-role transition and pre-plan model restoration policy; streaming switch deferred [O3] | OMP has the structural advantage for explicit planning. |
| Effort | Fixed configured effort per role, capability clamping | Separate automatic effort classification; online `tiny` then `smol`, plus local backend path [O4–O6] | OMP separates effort adaptation from main-model choice more fully. |
| Context capacity | Selector-input budget; execution compaction remains Pi's responsibility | Documented opt-in explicit context-promotion target on overflow [O8] | OMP offers a separate capacity control, not proof of better reasoning. |
| Advisors/background | No automatic child or per-tool-turn routing; explicit integrations only | Advisor transcript review; task role and subagent model-resolution mechanisms [O1–O2, O7] | OMP has broader integrated coverage; not equivalent semantic child routing. |
| Settings/control | User-wide role YAML, manual pause, fresh-field toggles, safe receipts | Global/project/CLI/runtime layers; session controls and optional persistent model changes [O6, O8] | Extension is narrower; OMP more flexible. No save-reliability winner established. |
| Observability | `/model-roles why`: reason, pair, bounded-context counts, selector usage/duration when available | Thinking-change receipts and advisor usage/status [O6–O7] | Different observability surfaces, not quality measurements. |

OMP's resolver's “usage order” means recently used **model identities**, not conversation interpretation. Its online effort classifier submits one preprocessed user message; preprocessing caps output at 2,000 JavaScript characters and removes/shortens selected envelopes, code, and hashes. The caller supplies `expandedText`, not a transcript. Advisors genuinely receive transcript deltas and project constraints, but they are a separate reviewer subsystem—not evidence that the main-model resolver is history-semantic. [O2, O4–O7]

## 4. Distinct pros and cons

### pi-model-roles

**Pros**

- **Direct fit without changing harness.** Task-based model/effort selection can use recent conversational referents while retaining Pi and existing commands. This is a structural product-fit advantage, not measured task quality.
- **Bounded, explicit data flow.** Conversation mode is opt-in. The UI asks for confirmation; direct YAML configuration bypasses that dialog, and contextual API callers own consent. No extra summarizer, repository scan, or selector tool execution is added. Strict role/output validation prevents arbitrary model identities from being accepted. [L1–L2]
- **Predictable controls and diagnostics.** Explicit choices take precedence; fallbacks and non-content receipts explain routing paths. Failed durable disable no longer defeats the local pause. [L1, L3]
- **Reusable policy core.** Existing v1 library/event contracts remain prompt-only; a separate contextual API makes broader data submission explicit. Auto Setup guidance now matches those visibility limits and asks for small, non-overlapping role portfolios. [L4]

**Cons**

- **Unproven semantic benefit.** Tests inject classifier JSON. They establish payload, validation, dispatch, and fallback behavior—not that real selectors correctly interpret “that” or avoid inheriting obsolete complexity. [L5]
- **Inference overhead and coupling.** Eligible custom-role submissions can add one default-model selector request, even to decide continuation. The default is both selector and fallback executor; no independent selector profile exists. History adds input; switches can affect caches and compaction. Net savings are unknown.
- **Incomplete and potentially misleading context.** Recent text is not necessarily relevant text. Raw tool evidence is absent, summaries can be stale, and older constraints can be dropped. Execution-context fit is not established by the selector-input budget.
- **Narrow lifecycle coverage.** No automatic queued-follow-up, mid-task, headless, or child routing. The command wrapper remains prompt-only. Pi's already-started `setModel` operation cannot be made fully atomic/cancellable by this extension. [L2, L4]
- **Configuration/privacy scope is coarse.** Context policy is user-wide; other sessions require reload. Excluding raw tools/reasoning/images is not secret redaction: copied visible sensitive text and unmarked past template expansions can still reach another selector provider.

### OMP

**Pros**

- **Workflow authority.** Its harness owns plan transitions, task/advisor integration, and session state rather than trying to infer all workflow intent through an extension hook. [O3, O7]
- **Separate mechanisms for separate problems.** Named roles, effort classification, transcript review, and capacity promotion are distinct. That can make explicit workflows easier to reason about than one semantic decision doing everything.
- **Richer configuration and runtime control.** Project settings, one-shot overlays, nonpersistent runtime overrides, and session-scoped advisor toggles accommodate different repositories without changing global defaults. [O6–O8]
- **Effort-only adaptation is available.** Users can retain a known-suitable main model while varying reasoning effort. The local classifier path is also relevant when avoiding an additional online classifier provider. Neither proves lower end-to-end cost. [O4]

**Cons**

- **Not the same automatic-selection feature.** Inspected named-role and auto-thinking mechanisms do not establish semantic main-model routing over conversational history. Users wanting that exact behavior still need explicit assignments or additional integration.
- **Lossy effort signal.** Expanded current text supplies information missing from the extension's raw invocation, but preprocessing can discard useful detail and cannot recover absent historical antecedents.
- **More operational surface.** Multiple configuration layers and reviewer/capacity controls offer flexibility but require understanding their precedence and effects. This is a complexity trade-off, not a measured reliability defect.
- **Contextual reviewers have separate costs and exposure.** First-party advisor documentation describes broader transcript/tool/constraint input and separate token/cost accounting; it also documents secret obfuscation. No equivalent privacy audit was conducted, so broader input must not be turned into a blanket claim that OMP is less secure. [O7]

## 5. Concrete scenarios

| Situation | Practical recommendation |
| --- | --- |
| Approved plan → “implement that” | Try extension conversation mode if the plan remains within retained bounds. It is instructed to **classify implementation**, not automatically keep the planning role. OMP's explicit plan approval/exit is stronger when you want a prescribed transition rather than inferred intent. |
| Same-task “continue” at idle | Extension can retain the eligible previous role, but pays for judgment when classification runs. OMP can keep its active model without a main-model classifier. A manually pinned pair is more predictable in either workflow. |
| Unrelated small task after complex work | Extension is expressly instructed not to inherit old complexity and can switch roles. That opportunity is also a failure mode: stale history may bias it. OMP effort may change without automatically changing the main model. |
| Explicit planning mode | Prefer OMP's owned plan lifecycle when restoration and mode control are essential. A Pi `/plan` template is not equivalent: extension routing sees raw command/arguments before expansion and supplies no automatic restoration. |
| Privacy-sensitive work | Keep extension prompt mode or disable automatic selection; still avoid sensitive submitted text/role descriptions. If using conversation mode, assess the selector provider separately. For OMP, evaluate local versus online effort classification and advisor settings separately; main execution still has its own data flow. |
| Background/subagent work | Prefer OMP's integrated subsystem assignments where they match the workflow. Installing pi-model-roles does not route children; its `run` wrapper selects the parent only. Explicit API-before-launch integration must carry resolved pins and allowed models. |

## 6. Ranked next improvements and fair evaluation

1. **Prove semantic value first.** Build reviewed synthetic/consented conversations for antecedents, task changes, ambiguous continuation, planning-to-code, multilingual requests, and truncated/compacted history. Label acceptable decisions before running models; allow several defensible roles rather than inventing one universal oracle.
2. **Measure total workflow cost and latency.** Capture selector overhead, execution usage, retries, cache effects, compaction, switches, and final accepted outcomes. Selector receipts alone cannot establish savings. Consider an independent selector profile only after this evidence.
3. **Improve explainability and context adequacy.** Add safe category-level inclusion/omission diagnostics and evaluate a conservative execution-context-fit warning. Do not solve missing evidence by silently expanding history or collecting tool output.
4. **Add explicit, repository-local integration contracts where justified.** Prioritize mode hints and consenting caller integrations over unsupported automatic child/per-turn interception. Preserve existing v1 privacy behavior.
5. **Validate operational acceptance.** Record human TUI checks, more host/platform versions, and fault-injection results. Compare OMP save semantics under equivalent concurrent-edit, locked-file, permission, crash, and post-commit-notification cases before claiming superiority.

**Paired evaluation design:** freeze both implementations, exact serving models, role assignments, tools, repository snapshots, and budgets. Compare extension prompt mode, extension conversation mode, OMP explicit roles with fixed effort, and OMP auto-thinking. Evaluate planning/advisors separately so extra reviewer compute is visible rather than hidden in a routing comparison. Include a fixed-model Pi baseline to isolate routing value from harness effects.

Run repeated, randomized paired trials with blind review of completed artifacts and independent tests. Report task success, harmful under-selection, unnecessary switching, fallback/timeout rates, latency distributions, total billed usage, and uncertainty—not invented scores. Predeclare quality and latency requirements; report trade-offs when lower cost reduces quality. Add synthetic privacy sentinels and failure injections without transmitting private production history. No such trial was run here.

## 7. Contradictions, missing evidence, and sources

**Contradictions resolved by versioning:** the historical local report says there is no semantic history input and identifies failed-disable/stale-toggle defects. Current working source implements context and recovery changes; those historical statements are not current behavior. The assumption that OMP auto-thinking is a full-history main-model selector is not supported by its inspected call chain. No contradictory pinned evidence was found for these narrow conclusions.

**Missing evidence:** real-provider routing accuracy, comparative completion quality/cost/latency, equivalent OMP persistence fault tests, broad host compatibility, and human terminal acceptance. OMP settings documentation already says saves re-read under a lock and preserve external edits; it would be unfair to market the local fix as exclusive or categorically more reliable.

### Local references — current working files

- **[L1]** [`selection.ts`](../../src/core/selection.ts), [`classifier-protocol.ts`](../../src/core/classifier-protocol.ts), [`routing-context.ts`](../../src/core/routing-context.ts), [`types.ts`](../../src/core/types.ts), [`defaults.ts`](../../src/core/defaults.ts) — protocol, precedence, continuation and bounds.
- **[L2]** [`controller.ts`](../../src/pi/controller.ts), [`Pi routing-context.ts`](../../src/pi/routing-context.ts) — actual idle-input projection, wrapper exclusion and application guards.
- **[L3]** [`store.ts`](../../src/config/store.ts), [`menu.ts`](../../src/ui/menu.ts), [`config-save.ts`](../../src/ui/config-save.ts), [`routing-settings.ts`](../../src/ui/routing-settings.ts) — persistence, consent and explanations.
- **[L4]** [`README`](../../README.md), [`configuration`](../configuration.md), [`API`](../api.md), [`compatibility`](../compatibility.md), [`Auto Setup prompt`](../../src/auto-setup/prompt.ts) — current contract and recommendation limitations.
- **[L5]** [`unit context tests`](../../test/unit/routing-context.test.ts), [`SDK context tests`](../../test/integration/routing-context.test.ts), [`toggle recovery`](../../test/integration/toggle-recovery.test.ts), [`context/queue tests`](../../test/integration/context-and-queue.test.ts) — synthetic enforcement evidence, not semantic benchmarks.

### Kept first-party OMP sources — pinned, accessed 2026-09-08

- **[O0]** [Resolved commit](https://github.com/can1357/oh-my-pi/commit/daf07999c2fee9b22edc7bf8fea1fb6272e0df5e) — identity/date, resolved through GitHub API.
- **[O1]** [Model roles](https://github.com/can1357/oh-my-pi/blob/daf07999c2fee9b22edc7bf8fea1fb6272e0df5e/packages/coding-agent/src/config/model-roles.ts) — built-in/custom assignments.
- **[O2]** [Model resolver](https://github.com/can1357/oh-my-pi/blob/daf07999c2fee9b22edc7bf8fea1fb6272e0df5e/packages/coding-agent/src/config/model-resolver.ts) — aliases, preferences and subsystem resolution.
- **[O3]** [Plan transition policy](https://github.com/can1357/oh-my-pi/blob/daf07999c2fee9b22edc7bf8fea1fb6272e0df5e/packages/coding-agent/src/plan-mode/model-transition.ts) — documented restoration policy and pure transition decisions.
- **[O4]** [Effort classifier](https://github.com/can1357/oh-my-pi/blob/daf07999c2fee9b22edc7bf8fea1fb6272e0df5e/packages/coding-agent/src/auto-thinking/classifier.ts), [preprocessing](https://github.com/can1357/oh-my-pi/blob/daf07999c2fee9b22edc7bf8fea1fb6272e0df5e/packages/coding-agent/src/tiny/message-preproc.ts) — actual classifier target/input.
- **[O5]** [Agent-session call site](https://github.com/can1357/oh-my-pi/blob/daf07999c2fee9b22edc7bf8fea1fb6272e0df5e/packages/coding-agent/src/session/agent-session.ts#L6366-L6375) — expanded current prompt.
- **[O6]** [Model controls](https://github.com/can1357/oh-my-pi/blob/daf07999c2fee9b22edc7bf8fea1fb6272e0df5e/packages/coding-agent/src/session/model-controls.ts) — four-second effort-classification timeout, last/provisional effort fallback, session/persistent controls.
- **[O7]** [Advisor documentation](https://github.com/can1357/oh-my-pi/blob/daf07999c2fee9b22edc7bf8fea1fb6272e0df5e/docs/advisor-watchdog.md) — attributed transcript, privacy and usage behavior, not independently audited guarantees.
- **[O8]** [Settings documentation](https://github.com/can1357/oh-my-pi/blob/daf07999c2fee9b22edc7bf8fea1fb6272e0df5e/docs/settings.md) — layers, save design and capacity promotion.

**Deprioritized:** omp.sh website shell/positioning, unpinned search snippets and older issue/PR hits; none establishes current runtime quality. The historical report was retained only as a source map.

**Bottom line:** the new extension is a better-targeted design for your conversational-routing request. OMP remains the stronger integrated workflow option in this comparison. Whether either is better in actual outcomes is the next experiment, not an established fact.
