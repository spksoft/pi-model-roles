# Research report: OMP model roles, contextual routing, and save reliability

**Date:** 2026-09-08

**Status:** Research and recommendations only; not current configuration guidance or an implemented feature.

**Local baseline:** `pi-model-roles` commit `f35901ad961940136796bd8a05c151f36b64d271`; installed development host Pi 0.85.1.

**OMP baseline:** first-party repository commit `daf07999c2fee9b22edc7bf8fea1fb6272e0df5e`.

No runtime code, role configuration, credentials, dependencies, models, permissions, or settings were changed. The only repository addition is this report. Public-source research, local source inspection, read-only configuration validation, and in-memory mocked probes were performed. OMP was not installed or executed; no live-model benchmark was run.

## Executive conclusion

**Add opt-in, bounded conversation-aware routing, but do not copy an assumed OMP full-history model selector: the inspected OMP implementation does not establish that behavior.**

OMP combines several distinct mechanisms:

- Configured model aliases selected by explicit commands, modes, and subsystems.
- Planning model transitions that preserve the pre-plan model.
- A separate automatic **effort** classifier that receives the current expanded prompt, not the whole conversation.
- Advisors that actually inspect transcript updates and project constraints.
- Separately configured context-capacity promotion and runtime provider fallbacks.

The useful lesson is to distinguish **task context, execution mode, model eligibility, effort, and runtime controls** instead of expecting one classification prompt to handle every concern.

For our package, the highest priorities are:

1. Make disable reliable even when saving fails; expose the actual safe failure category.
2. Make toggle persistence operate on fresh state without overwriting unrelated role edits.
3. Add a bounded active-conversation projection at the existing idle-input boundary.
4. Treat continuation as a first-class routing outcome rather than automatically returning to default.
5. Add context-aware evaluation fixtures and explainable routing receipts before changing defaults.

## 1. What OMP actually does

| Mechanism | Inspected behavior | Implication for our package |
| --- | --- | --- |
| Model roles | Built-ins at this commit are `default`, `smol`, `slow`, `vision`, `plan`, `commit`, `tiny`, `task`, and `advisor`; custom roles can be added through settings. | These are named assignments, not evidence of automatic semantic matching against descriptions. |
| Role resolution | Resolves configured aliases/patterns, availability, thinking suffixes, and fallback patterns. Model-usage preferences are recently used model identities, not conversation history. | Keep deterministic eligibility and exact assignment separate from task interpretation. |
| Plan mode | Resolves the `plan` role, switches on entry, restores the pre-plan model on exit; a mid-stream transition is deferred. | Explicit workflow state can be more reliable than guessing from prose, but OMP owns its harness. |
| Auto thinking | `AgentSession` passes `expandedText` to `applyAutoThinkingLevel`; the classifier resolves `tiny` then `smol` and selects effort for the active model. | It is not an automatic model selector and does not demonstrate history-aware classification. |
| Advisor | Reviews transcript deltas including tool activity and constraint context; has separate model usage and context maintenance. | This is genuinely context-aware, but much broader and more expensive than role selection. |
| Context promotion | Opt-in promotion to an explicitly configured target on context overflow; disabled by default in the inspected settings documentation. | Capacity handling is not a measure of which model reasons best about a task. |
| Temporary controls | Session-only model changes and advisor toggles are distinct from persistent configuration writes. | Separate immediate session intent from durable preferences. |

### Important detail: OMP's auto-thinking input is bounded and lossy

The inspected chain is:

```text
real user / user-invoked skill submission
  -> expandedText
  -> ModelControls.applyAutoThinkingLevel
  -> classifyDifficulty
  -> preprocessTinyMessage
  -> one classifier user message
  -> concrete effort for the already active model
```

`preprocessTinyMessage` strips ANSI sequences and paired XML/HTML-like blocks, shortens long hex runs, optionally removes fenced code, and caps the result at 2,000 JavaScript string characters using head/tail retention. It does not read files or load conversation history. Auto thinking has a four-second timeout and falls back to the last resolved or provisional effort; it does not choose the main model.

Therefore, OMP working well in practice does **not** prove that its role resolver evaluates the complete chat. Its mode-specific routing, session continuity, expanded prompt handling, and separate contextual subsystems may explain the experience. Identifying which feature produced a particular observed switch would require a concrete OMP example or runtime trace.

Sources: [O1]–[O8]. Context7 `/can1357/oh-my-pi` helped discovery; pinned first-party source takes precedence where cached snippets differ.

## 2. What our package currently knows

### Semantic selection

`src/core/classifier-protocol.ts` serializes only:

```text
eligible role IDs and descriptions + submitted task text
```

`src/pi/adapters.ts::completeClassifier` sends that data as one user message under the classifier's own system prompt. `SelectionRequest` has no conversation field, and its runtime validator rejects unknown request keys.

`src/pi/controller.ts::input` routes eligible idle primary-TUI submissions. `routeSubmission` reads the submitted text and makes the selection before normal Pi task preparation. Raw template/skill command text is eligible, but loaded bodies and command-generated plans are not gathered for classification.

### A correction to the simple “no context” explanation

The **semantic classifier** receives no history, but the **surrounding policy** already uses some session context:

- Current model/effort, inherited baseline, manual pause, and configured availability.
- `historyRequiresImages` inspects `buildContextEntries()` for retained image content shapes. It does not serialize or send the images to the selector.

After selection, execution still receives Pi's normal conversation context. This separation is intentional, but it leaves a gap for conversational intent.

### Why the gap matters

| Conversation situation | New message | Missing routing information |
| --- | --- | --- |
| A consequential migration plan has just been approved | “Implement that.” | The actual plan, constraints, and consequences. |
| Earlier debugging found an unknown cross-component failure | “Try the second approach.” | Which approaches exist and what remains uncertain. |
| The previous task is complete | “Now fix the spelling in this label.” | Recognition of a new, bounded task rather than inheriting old complexity. |
| A long investigation is ongoing | “Continue.” | Whether the task remains open and which assignment should remain active. |

More history is not automatically better: unrelated old tasks, repeated tool output, and obsolete plans can bias the selector. The goal should be **enough relevant context to identify the current task**, not a full transcript dump.

### Host boundary: context access is not the same as per-turn switching

Pi's public `ExtensionContext` exposes `sessionManager.buildContextEntries()`, branch/leaf identity, and `getContextUsage()`. Our existing image check already uses the first API at input time. The installed Pi docs and summary example demonstrate read-only conversation access.

This supports a repository-local implementation of **previous retained context plus the new prompt at idle input**. It does not expose the exact eventual provider payload there: later template expansion, extension injections, context transforms, compaction, and provider serialization may change execution context.

The existing package explicitly documents that Pi 0.85.1 snapshots dispatch model/effort before the `context` hook. Do not revive mid-tool-loop switching or advertise full final-payload visibility. Verify the proposed idle-input projection through the real SDK before shipping; no upstream modification is required or proposed.

Local evidence: `src/core/{types,selection,classifier-protocol}.ts`, `src/pi/{controller,adapters,session-state}.ts`, `src/extension.ts`, `docs/architecture.md`, `docs/compatibility.md`, and `test/integration/context-and-queue.test.ts`.

## 3. Enable/disable warning investigation

### What was checked without changing settings

At inspection time:

- The configuration file was a regular file and parsed successfully.
- It contained five roles and persisted `enabled: false`.
- Serialization with either `enabled: true` or `enabled: false` passed, entirely in memory.
- The file and its parent directory were writable by the research process.
- No `config.yaml.lock` existed at the time of inspection.

These observations do not reconstruct the failing command's in-memory revision, prove that no transient writer existed, or establish the active session's routing mode. They make a currently malformed YAML file or currently abandoned lock less likely explanations, not impossible historical causes.

### Confirmed implementation behavior

#### A. A stale snapshot can cause the warning

`src/ui/menu.ts::setAutoSelector` reads `controller.store.snapshot`, changes `enabled`, and saves the entire snapshot with its old revision. It does not reload before deciding whether a write is necessary.

`src/config/store.ts::replace` acquires an exclusive lock and compares the current file's SHA-256 revision against the expected revision. A different session or manual edit causes `ConfigError("conflict")`. Even a formatting-only external edit changes that revision.

This is correct lost-update protection. The problem is the stale whole-snapshot toggle operation and its poor recovery UX, not the existence of revision checks. It is a plausible explanation for the reported warning, **not a confirmed diagnosis of that incident**.

#### B. All failures are reported as the same warning

`src/ui/config-save.ts::saveRoleConfig` catches everything without preserving the error category. It conflates invalid data, revision conflicts, lock contention, filesystem failures, and even failures after the write has succeeded.

The store already supplies useful safe codes such as `conflict`, `lock_busy`, `unsafe_config_file`, and `save_failed`. `ConfigError.field` can identify a validation location without exposing file contents. Ordinary filesystem causes are currently collapsed into `save_failed`, so permission-specific diagnostics would need safe categorization in the store as well.

#### C. A failed durable save can prevent session disable

When a snapshot exists and the enabled value must change, `setAutoSelector` returns immediately on failed save, **before** calling `controller.disable(ctx)`.

Thus, a user's attempt to stop automatic routing can fail to pause the current session because global persistence failed. This should be fixed first.

#### D. A stale “already enabled” snapshot skips disk entirely

If the in-memory enabled value already equals the requested value, the command skips saving and resumes or disables locally. It does not verify whether another session changed the durable setting. The success message does not distinguish session state from durable state.

#### E. A post-save UI failure is misreported as a failed save

`controller.status(ctx)` and the success notification run inside the same `try` as the write. If status rendering throws after `store.save` succeeds, the function returns failure and emits the generic save warning even though the durable write already committed. Retrying under that assumption is misleading.

### In-memory probes executed

The shipped `dist/ui/menu.js` and `dist/ui/config-save.js` were invoked with fake controllers and stores. No real `ConfigStore` writer or model was invoked.

| Probe | Observed result |
| --- | --- |
| Disable with mocked `conflict` | One save attempt, zero calls to session disable, generic warning. |
| Enable with mocked `conflict` | One save attempt, zero calls to session resume, generic warning. |
| Enable with an already-enabled stale snapshot | Zero loads, zero saves, one session resume. |
| Successful mocked save followed by status failure | Save recorded as successful by the mock, function returned false, generic save warning. |

These are focused behavioral reproductions, not a live reproduction of the user's historical failure. Existing store tests cover concurrent conflicts and abandoned locks; the inspected settings-flow tests cover successful toggles, not these failure paths. The full test suite was not run for this report.

### Safe recovery with the current release

1. Let active work/model switching finish.
2. Run Pi's `/reload`, then retry the intended `/model-roles enable` or `/model-roles disable` command.
3. Check the footer's actual `auto-selector=enabled|disabled` state; a failed disable must not be assumed to have paused routing.
4. If it still fails, investigate the specific configuration/path issue rather than repeatedly overwriting the file.

There was no lock to remove during this inspection. Never delete a lock or force an overwrite just because this generic warning mentions one. A future diagnostic should report only recovery steps relevant to its actual error category.

## 4. Recommended design

### P0 — reliable session controls and truthful persistence results

Keep existing command intent and documented durable defaults for compatibility, but separate the operations internally:

- **Disable first pauses locally**, invalidates pending selection, and pins the current pair. It then attempts persistence. A save failure must leave the local pause intact and say, for example, “Disabled for this session; global setting was not saved: conflict.”
- **Enable** should resume automatically only when the intended durable operation succeeds. On failure, remain paused or offer an explicit session-only choice; never silently enable after reporting failure.
- Replace whole-stale-snapshot toggle writes with an explicit **set-enabled transaction**: acquire the existing lock, read and validate current disk contents, update only `enabled`, then atomically commit. A no-op must also use fresh state.
- Preserve unrelated roles, timeout, and other fields. This is a deliberate current-value setter, not a force-save of a stale role draft. Concurrent toggle requests should have a documented serialized ordering.
- Keep strict expected-revision checks for role editing and Auto Setup review. Do not generalize automatic rebasing to arbitrary drafts.
- Retain exclusive locks, bounded waits, atomic rename, private files, and no automatic lock stealing. If owner metadata is added, PID/age alone must not authorize lock removal.
- Return structured persistence outcomes and separate committed-write failures from post-commit UI/session-notification failures.
- Display safe error code, relevant path/field, local routing state, and whether persistence committed. Do not log YAML contents, provider errors, or credentials.

Primary files: `src/ui/menu.ts`, `src/ui/config-save.ts`, `src/config/store.ts`, `src/pi/controller.ts`; corresponding settings/store tests and user recovery docs.

### P1 — opt-in bounded conversation-aware routing

Retain prompt-only behavior for existing installations until users explicitly choose the broader data flow. Introduce one clearly documented context-aware mode rather than silently changing privacy expectations.

Suggested projection, built locally from public Pi session APIs:

1. The current submitted task, kept intact and given precedence over obsolete task goals.
2. Recent retained user messages and assistant-visible text relevant to interpreting the request.
3. A bounded existing compaction/branch summary when available, clearly labeled as generated and potentially incomplete.
4. The previous selection and current eligible model/effort, tagged with session/branch identity.
5. Non-content metadata such as retained image presence and an explicitly approximate context-usage estimate.

Start with a deterministic bounded projection and **no additional summarizer model call**. A provisional history allocation of roughly 4,000 tokens is a tunable evaluation starting point, not a measured optimum. Reserve budget for roles, current input, and output first; report which context categories were omitted. Do not truncate the actual task Pi will execute.

Exclude raw reasoning blocks, credentials, arbitrary custom entries, raw tool arguments/results, repository scans, and full system/skill files by default. Assistant text and compaction summaries can still contain sensitive material originating in tools or files: exclusion of raw tool results is not a secrecy guarantee. Richer tool evidence or explicit project routing constraints can be separately consented extensions after evaluation.

Use `buildContextEntries()` rather than all session entries. Handle both materialized `retainedTail` compactions and legacy compactions; do not resurrect abandoned branches. Read existing data only: role selection should not run discovery tools or collect new repository content.

### P1 — continuation and new-task decisions

Extend the bounded selector protocol to distinguish:

- **Continue the current task:** retain the eligible current role/pair if context establishes continuity and there is no new conflicting scope.
- **Start or materially change a task:** classify the new request in light of relevant context.
- **Insufficient context or unresolved ambiguity:** preserve explicit pins and apply a documented conservative fallback; do not invent a specialist match.

“Continue” should not mean unconditional retention, and “implement that” is not necessarily the same role as the earlier plan. Execution intent can change while the goal remains the same. A new unrelated request must not inherit old high-risk classification merely because it appears in history.

Keep explicit user/caller model choices authoritative. Revalidate availability and image eligibility before applying any retained or newly chosen pair. Do not select arbitrary unconfigured models or rank capability from context-window size.

Capture session/leaf/config generation with the projection. Discard stale results after navigation, compaction, manual changes, reload, or new execution. A small cached routing summary, if added later, must carry provenance and be invalidated with those boundaries.

### P2 — explicit mode hints, eligibility, and observability

- Allow cooperating callers to supply an explicit requested role or bounded mode/intent hint. The current API already supports `requestedRole`; automatic integration with other packages must not be assumed.
- Do not infer workflow state merely because a `/plan` command or tool is installed. For extension-owned commands, keep using the supported explicit wrapper; do not replace foreign handlers or read referenced files without permission.
- Consider an estimated execution-context-fit guard before moving to a much smaller model. `getContextUsage()` is an estimate of current context, not the complete next payload. Guard conservatively and let Pi own actual compaction; do not promise exact fit or automatically increase windows.
- Add a read-only “why this selection?” view with reason codes, context mode, included/omitted categories, prior-role retention, selected pair, fallback, and selector usage/latency. Do not persist raw context or free-form explanations that may reproduce private text.
- Consider a separate selector model/effort profile only if measurements justify it. Do not choose a cheap or low-effort selector solely from its name; selector reliability matters. Account for changed-provider cache loss and execution replay/compaction costs, not just classifier tokens.

Keep these policies separate from the Pi adapter. A typed bounded `RoutingContext` can be additive to a new library interface, but the existing strict event/request validator rejects unknown fields: version or negotiate that wire contract explicitly. Update Auto Setup's description rubric to match the chosen context mode instead of continuing to claim that prior context is always invisible.

## 5. Validation and rollout gates

### Routing fixtures

Use synthetic or explicitly consented transcripts, never private chat fixtures by default:

- Approved architecture plan + “implement it”: recover constraints without classifying it as plan-only.
- Unresolved multi-component bug + “continue”: preserve suitable diagnostic continuity.
- Prior complex task + explicit unrelated typo fix: reset task scope.
- Multiple possible antecedents + “do the second one”: do not invent an antecedent.
- Compaction with and without `retainedTail`; branch switch; reload; stale async result.
- A short task with a large retained context; text-only model with retained images.
- Conflicting roles, unavailable previous model, timeouts, cancellation, and explicit pins.
- Tool-output injection and assistant suggestions to change model: contextual data cannot bypass configured roles or user authority.
- Context mode off: byte-level selector payload contains no newly collected history.

Compare prompt-only and context-aware routing on the same cases. Measure task/role agreement against reviewed expectations, inappropriate downgrade rate, unnecessary switching, fallback rate, selector latency/usage, and end-to-end completion quality. Unit tests validate projection and protocol; they do not establish semantic classifier accuracy. Separate live optional evals from credential-free CI.

### Persistence fixtures

- Two stores edit unrelated roles while a toggle is requested: toggle preserves their changes.
- Both same-value and changed-value stale toggles consult fresh durable state.
- Conflict, active lock, unwritable path, invalid YAML, and removed file.
- Failed disable still pauses locally; failed enable does not silently unpause.
- Successful write followed by UI/session persistence failure reports committed state accurately.
- Concurrent toggles have documented order; role drafts still reject stale revisions.
- Provider availability failures do not turn a valid boolean toggle into a role revalidation failure.

### Shipping sequence

1. Ship persistence/control fixes independently with regression tests and accurate recovery messages.
2. Add projection and protocol tests behind explicit context-mode consent.
3. Evaluate paired synthetic conversation cases, then optional real-provider trials.
4. Update README, configuration/privacy docs, architecture, API compatibility, Auto Setup guidance, CHANGELOG, and manual acceptance checklist with the feature change.
5. Consider making context-aware routing the recommended setup only after measured benefit. Existing users must not silently start sending history to a different selector provider.

Rollback is to prompt-only routing without deleting roles, resetting providers, changing compaction, or altering the user's explicit model selection. No Pi, pi-subagents, OMP, or provider dependency patches are part of this proposal.

## Sources

All external sources below were accessed on 2026-09-08. Links and observations are agent-reported; these are implementation/documentation findings, not independent runtime benchmarks.

- **[O1] OMP built-in role definitions:** [model-roles.ts](https://github.com/can1357/oh-my-pi/blob/daf07999c2fee9b22edc7bf8fea1fb6272e0df5e/packages/coding-agent/src/config/model-roles.ts).
- **[O2] OMP role/model resolution:** [model-resolver.ts](https://github.com/can1357/oh-my-pi/blob/daf07999c2fee9b22edc7bf8fea1fb6272e0df5e/packages/coding-agent/src/config/model-resolver.ts).
- **[O3] OMP planning transition policy:** [model-transition.ts](https://github.com/can1357/oh-my-pi/blob/daf07999c2fee9b22edc7bf8fea1fb6272e0df5e/packages/coding-agent/src/plan-mode/model-transition.ts).
- **[O4] OMP effort classifier and its input preprocessing:** [classifier.ts](https://github.com/can1357/oh-my-pi/blob/daf07999c2fee9b22edc7bf8fea1fb6272e0df5e/packages/coding-agent/src/auto-thinking/classifier.ts), [message-preproc.ts](https://github.com/can1357/oh-my-pi/blob/daf07999c2fee9b22edc7bf8fea1fb6272e0df5e/packages/coding-agent/src/tiny/message-preproc.ts).
- **[O5] OMP classifier call site:** [agent-session.ts, lines 6366–6375](https://github.com/can1357/oh-my-pi/blob/daf07999c2fee9b22edc7bf8fea1fb6272e0df5e/packages/coding-agent/src/session/agent-session.ts#L6366-L6375).
- **[O6] OMP effort timeout/fallback and temporary controls:** [model-controls.ts](https://github.com/can1357/oh-my-pi/blob/daf07999c2fee9b22edc7bf8fea1fb6272e0df5e/packages/coding-agent/src/session/model-controls.ts).
- **[O7] OMP advisor context, session toggles, and limitations:** [advisor-watchdog.md](https://github.com/can1357/oh-my-pi/blob/daf07999c2fee9b22edc7bf8fea1fb6272e0df5e/docs/advisor-watchdog.md).
- **[O8] OMP settings, role storage, context promotion, and fallback configuration:** [settings.md](https://github.com/can1357/oh-my-pi/blob/daf07999c2fee9b22edc7bf8fea1fb6272e0df5e/docs/settings.md).

The `omp.sh/docs/roles` page returned only a site shell through the configured fetcher, so substantive conclusions use the first-party repository rather than claiming the page content was verified.

**Local Pi documentation inspected:** the installed 0.85.1 `docs/extensions.md`, `docs/session-format.md`, `docs/compaction.md`, and `examples/extensions/summarize.ts`, plus the installed public extension type declarations. Relevant public project reference: [Pi extension API documentation](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/docs/extensions.md); the installed version, not moving `main`, is the compatibility evidence for this report.
