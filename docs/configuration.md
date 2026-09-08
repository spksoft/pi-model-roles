# Configure model roles

[← README](../README.md) · [Architecture](architecture.md) · [Compatibility and troubleshooting](compatibility.md) · [Integration API](api.md)

This is the detailed configuration guide. For the high-level routing design, see [Architecture and routing flow](architecture.md).

For most users, **`/model-roles settings`** is the only configuration UI needed. Use it for Auto Setup and role CRUD; use `/model-roles enable`, `/model-roles disable`, and `/model-roles use <role>` for runtime selection. You do not need to write YAML or look up provider IDs by hand.

## Manage roles in Pi

| Goal | Action |
| --- | --- |
| Start Auto Setup | Select the first **Auto Setup** item in `/model-roles settings`. |
| Add a role | In Settings, press **A** → identifier → task-observable “Use when …” description → model → effort → review and save. |
| Read roles | Settings lists every role, assignment, effort, description, and availability warning. |
| Change a role/default | Select it with arrows (or `j`/`k`) → **Enter**. Review all fields before saving. |
| Remove a custom role | Select it → **D** → confirm. This does not change the active execution model. |
| Choose a role yourself | Run `/model-roles use <role>`. Auto Selector keeps its current state. |
| Stay on the selected role | Run `/model-roles disable`; re-enable future routing with `/model-roles enable`. |

Settings intentionally exposes only Auto Setup plus create/read/update/delete role actions—no use, move, pause, global toggle, reload, status, or reset operations. The default role cannot be deleted or renamed. Role edits remain drafts until confirmed, and cancelling leaves the model and file unchanged. Saving a role does not immediately switch the execution model.

### Model picker controls

Role creation, custom-role editing, default-role editing, and Auto Setup share the same Pi-style picker. It displays **at most eight models per page**, reduces that count on short terminals, and truncates long labels to the terminal's display width. The search field is active immediately—no `/` or Ctrl+F activation is needed.

- Type a partial provider/model ID to fuzzy-filter and rank matches. Slash-separated terms work too, such as `openrouter/sonnet`. Filtering resets to the first page; it never changes stored model identities.
- Use **↑/↓** to move (wrapping at the ends), **PgUp/PgDn** to change pages, **Backspace** to edit the query, and **Ctrl+U** to clear it. Pi's configured `tui.select.*` bindings are honored.
- **Enter** selects the highlighted model when editing a role. The existing assignment is initially highlighted when available. Only default-role editing offers the searchable **Use Pi default model** option.
- In Auto Setup, **Space** or **Tab** toggles the highlighted model; **Enter** continues with the checked models. Up to eight may be checked across searches/pages. Use slash-separated search terms since Space toggles a candidate here.
- **Escape** or **Ctrl+C** cancels immediately, even with a query. There is no separate search mode: `j`, `k`, `H`, `L`, and `/` are search text, not navigation shortcuts. Dashboard `j`/`k` navigation is unchanged.

The picker uses cached available models within Pi's current scope. It does not refresh providers, make network requests, switch the active model, or save roles until the normal confirmation flow completes. No new configuration setting is required.

## Auto Setup

Auto Setup is a primary-TUI workflow for researching **one to eight** cached available models and proposing ordinary role changes. It has no YAML settings and does not configure providers, credentials, search services, or Pi's tool permissions.

1. Open `/model-roles settings`, select the top **Auto Setup** item, then choose models with Space or Tab and continue with Enter. Use the shared [model picker controls](#model-picker-controls) to search and navigate pages. Escape cancels immediately.
2. Read and confirm the disclosure. Research uses the **current Pi model** without switching it. The generated prompt includes selected candidates' exact IDs, supported efforts, image support and context windows, plus the loaded configuration snapshot's role descriptions/assignments, `enabled`, `selectorTimeoutMs`, the stored/global `selectorContext`, and optional independent `selector` profile. The model also receives its normal Pi conversation/provider flow and may use the tools you already configured. Do not put secrets in descriptions. Tool providers can make requests, charge, or retain data under their own policies. Auto Setup does not sandbox them.
3. The normal agent should research first-party material for every exact selected provider/model ID and submit a structured report. The prompt asks it to recommend the smallest useful role set, write criteria decidable from the submitted task and any context exposed by the configured selector policy, avoid execution instructions and model claims in descriptions, and check every pair for overlap. Good/bad few-shot descriptions demonstrate these boundaries. It may instead report that no official evidence was found, that it used offline knowledge, or that a serving-model identity could not be resolved. A source URL is agent-reported and user-reviewable, not independently verified by this package. Offline knowledge means no web evidence was collected; it is not a local model run.
4. When research or refinement settles, Auto Setup opens its review automatically. No second command is required. Inspect per-model evidence state, source dates, benchmark conditions/caveats, documented upstream mappings, model and effort rationales, evidence-model references, uncertainty, and trade-offs. A suggested default has its own explanation and affects fallback execution and, unless an independent profile is set, the selector. **Discuss/refine** sends a new guarded normal-agent message with all original candidate capabilities (including unused candidates), the prior proposal, and the currently loaded configuration snapshot. If the session becomes busy before the deferred review opens, reopen the draft from the top of Settings. Ordinary chat is not captured as Auto Setup discussion.
5. Choose whether to keep conflicts, replace individual conflicting roles, or replace all custom roles after a destructive confirmation. Confirm the final diff, which shows exact before/after model, effort and description values for changed roles, including additions/deletions and an explicitly chosen default. Retained conflicts are not shown as changes. Research and discussion alone never write `config.yaml`.

Auto Setup preserves `enabled`, `selectorTimeoutMs`, `selectorContext`, the optional `selector` profile, runtime context overrides, untouched roles, the session's routing mode, and the current model/effort. An unchanged unavailable role does not prevent an otherwise valid proposed addition; a model/effort newly added or changed must still be cached as available and supported at save time. A suggested default replacement is separate and never implicit. Adding the first custom role also shows the normal future-selector cost/provider disclosure; research consent does not grant that permission.

The tool schema describes every nested proposal field. Each assessment's `caveats` is a required array of zero to four non-empty strings, each at most 500 characters: for example, `"caveats": ["Agent-reported; not independently verified."]`, or `"caveats": []` when none. Other report text fields such as `summary`, `rationale`, and `uncertainty` are strings, not arrays. Report text must be trimmed and contain no line breaks or ASCII control characters. In the tested Pi 0.85.1 host, schema-based argument conversion can wrap a scalar caveat in a one-item array; the package still validates the resulting report before accepting a draft. Persisted drafts must already have the canonical array shape.

Validation rejections identify the failing field. Research and refinement instruct the agent to correct a rejected report and retry once using the same request ID and generation, stopping after acceptance, an inactive request, or another rejection. This is agent guidance, not a hard tool-call budget or a new research run; normal model/tool charges still apply. Acceptance disables the handoff tool, and cancelled/stale requests remain rejected. No rejected report becomes reviewable or writes role YAML.

The proposal is bounded to eight models, three source records per model (24 total), 31 custom suggestions, 2,048-character URLs, 1,500-character assessments, 1,000-character role rationales, 500-character effort rationales/caveats, 64 KiB tool/session payloads, and 32 KiB generated prompts. Inputs beyond these bounds are rejected, never silently truncated. Existing descriptions and prior proposals count toward the prompt limit; if they make it too large, nothing is sent. Shorten the discussion or descriptions, start a smaller pass, or use manual editing. The generated setup messages participate in normal Pi conversation persistence; the package stores only bounded report/draft state in Pi custom session entries, not live request tokens, credentials, raw fetched pages, or deliberately copied conversation text. Bounded generated report text can still contain unwanted material; do not treat this as a secret-detection guarantee.

Press Escape to stop an active research turn. After a proposal settles, **Cancel proposal** in the automatic review discards it. Cancellation cannot reverse completed requests, charges, or tool effects. A valid restored proposal is review-only. A malformed, unknown-version, cancelled, or applied latest Auto Setup session marker is non-actionable and never revives an older draft. If configuration changes after research, reload/check it and review a new exact diff before saving. If configuration saves but its session applied marker cannot be recorded, the role file is already saved; the package reports a warning and does not retry.

`/model-roles disable` immediately pins this session's current role/model/effort, then saves `enabled: false`. If persistence fails it stays locally disabled and reports that other sessions' durable state was not changed. `/model-roles enable` first pauses locally, then saves `enabled: true`; only a successful save resumes future routing in the unchanged session. Failed enable remains paused. Neither command sends a selector request immediately. Both read fresh disk state under the lock and update only `enabled`, even when the in-memory value already matches; unrelated valid edits are preserved. A direct `/model-roles use <role>` preserves whichever state is active.

### How Auto Setup designs recommendations

Research and refinement share the same rubric, with no new YAML options:

- **Task fit before model ranking.** Use explicitly stated workload/priorities; otherwise state a conservative balanced assumption. Compare relevant instruction following, tool-use reliability, reasoning, modality and context requirements. No local benchmark is run and no universal “best model” is claimed.
- **Minimum useful portfolio.** Check proposed roles against retained existing roles, not just each other. Reuse an existing ID for an intentional replacement; describe required replacements in the summary. If a partial merge keeps old boundaries, review those for overlap yourself—the package does not semantically validate descriptions.
- **Only observable context.** The selector cannot see actual repository size, remaining context or image contents. Prompt mode sees no history; conversation mode supplies only bounded retained text/summaries, not the full transcript. Auto Setup cannot opt you into history sharing. A short submitted task can still need substantial execution context. Roles cover whole tasks, not automatic plan/code/review phases. A larger context window is a capacity limit, not a quality score.
- **Effort needs justification.** Choose the lowest supported effort justified by reliability needs, with extra effort justified by uncertainty, risk or competing constraints. Supported does not mean optimal; label unmeasured choices provisional. Effort labels are not comparable compute budgets across providers. Default recommendations must consider selector overhead as well as general-task reliability; `enabled` and the selector deadline remain unchanged.
- **Reviewable design checks.** Ask for clear matches, near-misses, cross-role examples, vague continuations, and mixed-intent tasks; include a terse synthetic match/near-miss in each rationale. These are agent-authored checks, not executed selector tests or verified accuracy. Use non-sensitive examples in Discuss/refine to challenge the boundaries before saving.
- **Targeted, untrusted evidence.** Request public-model-identity searches and relevant source passages, not raw-page dumps or private workload queries. Existing descriptions, model IDs, sources, and previous proposals are delimited as data, not tool-use instructions. This is prompt guidance, not enforced search filtering or an injection-proof boundary. Reuse prior evidence during refinement and research material gaps; do not turn offline knowledge into citations. Price/latency and benchmark comparisons need compatible serving-provider, date, units, caching and evaluation conditions.

These design choices draw on [Anthropic's context engineering guidance](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) (high-signal context, clear sections, minimal overlapping choices) and [OpenAI's reasoning best practices](https://platform.openai.com/docs/guides/reasoning-best-practices) (direct goals, delimiters, workload-dependent model choice). These sources inform the prompt design, not rankings of today's selected models. Provider-specific model claims must still be researched for the exact selected serving IDs. No compaction, tool-permission, system-prompt or provider setting is changed by this rubric.

## Write useful role descriptions

A description tells the selector **when the role applies**, not how to perform the task.

- Prefer a compact `Use when …` criterion based on task-visible scope, uncertainty, risk, modality, or reasoning needs: “Use when the request is a localized, low-risk documentation correction with no code changes.”
- Give each role a clear match, a near-miss, and tasks that belong to another role. If boundaries remain ambiguous, combine or remove roles rather than forcing coverage.
- Avoid broad overlaps such as “Use for coding” and “Use for programming.” Multiple matches use `default`, not the first role in the list.
- Keep model/provider names, speed, price, benchmark claims, and reasoning effort out of descriptions; those justify the assignment rather than define the task.
- Put execution instructions such as “Run the tests before finishing” in your prompt or `AGENTS.md`, not in a role description.
- Choose models already available in Pi. The package does not configure providers, authenticate accounts, or measure which model is best.

The first custom-role save asks you to confirm the extra request's cost and data flow. Manually adding custom roles to YAML enables the same behavior without that dialog; read [cost and privacy](../README.md#cost-and-privacy) first.

## Where settings live

There is one user-wide file:

```text
~/.pi/agent/extensions/pi-model-roles/config.yaml
```

The exact path is `join(getAgentDir(), 'extensions', 'pi-model-roles', 'config.yaml')`. If you set `PI_CODING_AGENT_DIR`, it replaces `~/.pi/agent`. Settings includes this path when it reports an invalid configuration.

- Roles are shared across projects, even when the package is installed with Pi's `-l` option.
- There are no project role overrides, environment-based role definitions, or background file watchers.
- The file lives outside the GitHub checkout and survives package updates/removal. Back it up if you want to preserve a particular configuration.
- Role changes never update Pi's saved model defaults, authentication, or other packages' settings.

Only a missing file is automatically created, and only in a primary interactive terminal session. The package never replaces an existing invalid file automatically.

## Edit YAML manually

Edit the file at the path above, then run Pi's `/reload`. Successful Settings saves take effect in that session immediately; other open sessions need `/reload`.

This is the initial configuration:

```yaml
version: 1
enabled: true
selectorTimeoutMs: 8000
roles:
  default:
    model: inherit
    effort: inherit
```

A custom role adds a description, an exact provider/model pair, and an explicit effort:

```yaml
version: 1
enabled: true
selectorTimeoutMs: 8000
roles:
  default:
    model: inherit
    effort: inherit
  quick:
    description: >-
      Use for small, well-specified edits that do not require design decisions.
    model:
      provider: example-provider
      id: owner/example-model
    effort: low
```

**The provider and model above are placeholders**, not working defaults. Choose real models through the menu, and use only efforts those models support.

Menu saves normalize YAML: **comments and formatting are not preserved**. The default role is written first and custom roles are sorted by identifier. That order is for readability, not selection priority.

### Configuration reference (version 1)

| Field | Requirement / default | What it controls |
| --- | --- | --- |
| `version` | Required; `1` | Configuration format. Other versions are rejected without migration or overwriting. |
| `enabled` | Optional; `true` | Automatic routing. `false` keeps the current model/effort; menus and explicit role use remain available. |
| `selectorTimeoutMs` | Optional; `8000` | Selector deadline in milliseconds, including its authentication/setup. Integer from 1,000 to 60,000. Does not limit task execution or Pi's separate model-switch operation. |
| `selectorContext` | Optional; `prompt` | `prompt` sends task/roles only. `conversation` adds bounded retained dialogue for eligible idle TUI routing. See below. |
| `selector` | Optional; absent | Independent `{model: {provider, id}, effort?: Effort}` profile; absence retains default-role classifier identity and no explicit selector effort. See below. |
| `roles` | Required | Between 1 and 32 roles, including `default`. |
| Role identifier | Required | Unique lowercase ID matching `[a-z][a-z0-9_-]{0,47}`. `constructor`, `prototype`, and `__proto__` are forbidden. |
| `default.model` | Required; initially `inherit` | Pi's inherited model, or an exact `{provider, id}` override for this package. |
| `default.effort` | Required; initially `inherit` | Pi's inherited thinking effort, or an explicit effort. |
| Custom `description` | Required | When to use the role: 1–2,000 Unicode characters after trimming. Multiline and non-English text are supported. |
| Custom `model` | Required | Exact `{provider, id}`. Custom roles cannot use `inherit`. |
| Custom `effort` | Required | An explicit supported effort. Custom roles cannot use `inherit`. |

Effort values are `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, and `max`. Availability depends on the model; the menu shows only supported levels. Models without reasoning use `off`.

If a saved effort is no longer supported, normal role selection uses Pi's clamping rule: choose the next supported higher level, otherwise a lower level. Status reports `effort_clamped` and the requested/effective values. Explicit API effort pins are rejected rather than silently clamped.

Provider and model IDs are separate, exact identifiers. Each must be nonempty, whitespace-trimmed, at most 512 UTF-16 code units, and contain no ASCII control characters. Model IDs may contain slashes. Routing and saved configuration use exact identity, not fuzzy name matching; fuzzy search is only a picker convenience.

This file does **not** configure provider endpoints, credentials, tools, permissions, execution instructions, or execution sampling parameters. Unknown fields are rejected.

## Independent selector profile

Run `/model-roles selector`, choose **choose** or **reset**, and review the provider/data/cost disclosure. The cached picker uses exact eligible identities including slash-containing IDs. **adapter default** is offered only for unpinned selectors and omits the effort option; it does not inherit the execution role's effort. Reset removes the whole profile and returns to the resolved default-role selector, after confirmation and eligibility validation; a pinned default selector needs a matching explicit profile instead. Neither action switches execution or rewrites Pi defaults. Saves use the usual revision/lock protection; cancelling, stale selection or failed save leaves the profile unchanged. Committed-but-UI-failed saves must be inspected after reload, not blindly retried.

`selector.model` is required when a profile is present; `inherit`, aliases and provider preference lists are not allowed. `selector.effort` is optional and uses the normal effort enum, but explicit selector effort is **never clamped**. The library validates model capability and optional adapter capability; the Pi 0.85.1 adapter currently verifies **OpenAI Responses (`openai-responses`) only**. Other APIs can use an independent model with effort omitted only when unpinned. A scoped thinking-level pin requires an explicitly configured matching selector effort and verified forwarding, even when the profile is absent or model-only; otherwise selection makes no classifier call and uses normal permitted execution fallback. Responses uses `reasoningEffort`, Pi's model `thinkingLevelMap`, and its explicit-off serialization (no effort option, serialized `none` or the configured off mapping). Configured providers whose matching `streamSimple` overrides completion are not verified and refuse explicit effort before transmission. Unsupported levels, conflicting model `samplingParams.reasoning`, and reasoning-capable GitHub Copilot's unverifiable off are rejected before sending selector text. Arbitrary custom provider implementations and live endpoint behavior are not certified by API identity.

The optional profile is user-wide YAML, takes effect after saving here (other sessions need reload), and survives all Auto Setup merge choices. Temporarily unavailable identities are retained for repair. Missing/out-of-scope selector, unsupported effort, timeout, invalid output and transport failure use normal **execution** fallback; there is no second selector model/provider request. The selector respects caller scope but does not need execution image support. Existing default-only/explicit/manual/requested-role bypasses still make no classifier call. No cheap-model default or semantic/latency advantage is assumed. Use `/model-roles why` for `selector_unavailable` or `selector_effort_unsupported`, then repair the profile/provider or explicitly reset it.

## Selector context

Prompt-only is the unchanged default; existing files require no migration. Use `/model-roles context` for a choice menu, `/model-roles context conversation` to opt in after confirming the disclosure, or `/model-roles context prompt` to opt out. The saved field is:

```yaml
version: 1
selectorContext: conversation # omitted or prompt disables history sharing
roles:
  default:
    model: inherit
    effort: inherit
```

This command remains user-wide, not per-project. It never removes an explicit session override; its saved value may be masked here. Successful changes take effect in the current session without enabling routing or clearing a manual pause; other sessions need `/reload`. Cancellation or failed persistence leaves the previous policy active. Editing YAML directly bypasses the confirmation dialog and is an explicit opt-in. Auto Setup never changes this policy.

Conversation mode uses public retained active-branch context at idle input. It includes up to **12 user/assistant text messages or existing compaction/branch summaries**, each at most **4 KiB UTF-8**, **16 KiB total**. Recent messages take priority; truncation preserves Unicode boundaries. Oldest optional history may be dropped again to fit the selector's context window. Missing/unsupported history is safely treated as empty. There is no new summarizer, full-history read, provider call beyond the usual selector, or change to Pi compaction.

Excluded: raw thinking/reasoning blocks, tool calls/results, image bytes, arbitrary custom entry data, and separately loaded system/repository/context files. Recognized Pi skill envelopes are reduced to `/skill:name` and arguments. **This is not secret redaction:** retained visible dialogue and summaries can contain secrets, copied tool/resource content, or unmarked past template expansions. They are sent to the configured selector provider (default-role provider unless overridden), potentially a different provider from execution, under that provider's retention/pricing policy. The current submitted task is still sent intact, including any pasted sensitive content.

A clear same-task continuation may retain the previous role only while its model/effective effort remain eligible and exactly match the current pair. New tasks, scope/risk changes, or moving from planning to implementation require reclassification; unavailable or unverifiable continuation falls back. This judgment is model-dependent, not a guarantee. Explicit choices, manual pauses, image requirements, and allowed-model scope remain authoritative.

This policy covers eligible idle TUI input submissions. The `/model-roles run` wrapper and existing v1 library/event APIs stay prompt-only; the library has a separate explicit [contextual API](api.md#explicit-contextual-selection). There is no per-tool-turn, queued-follow-up, or automatic child routing.

`/model-roles why` shows the last runtime decision: role/model/effort, reason/fallback, context mode/count/bytes/truncation, and selector duration/usage/cost when available. It never prints task/history text or raw replies. This explanation is not restored after reload; metadata counts describe selector input, not measured relevance or accuracy.

### Logical-session context override (process only)

Use `/model-roles context-session prompt` for a local opt-out with **no YAML or session-entry write**, even when config cannot be saved. `conversation` requires the same informed sharing confirmation; `inherit` explicitly removes the override and confirms if the global policy is conversation. Without an override, stored/global policy applies. `/model-roles context-session` opens a chooser displaying global, override and effective policy. Global context commands retain their original meaning and do not clear the override.

Scope is the **session UUID plus agent directory within this Node process**, shared by all hosts opening that same logical session/key. It is not host-local or a security boundary. Reload, tree navigation, pause/enable/disable, manual pair changes, role/profile edits and Auto Setup preserve it. Switching sessions uses the destination key; revisiting restores its override. New/forked/cloned UUIDs use global policy. Process restart expires all overrides, including prompt-only opt-outs; choose the global prompt policy for durable opt-out. No project files are loaded to expand sharing.

The process map retains at most 1,024 touched session keys, including inherit tombstones needed to detect change-then-revert. At capacity it refuses new keys with a warning; existing keys remain editable and no opt-out is evicted. Pause routing if a refused opt-out cannot be set. Same-key changes invalidate pending decisions through a monotonic revision, including changes from another host and change-then-revert. Already sent context cannot be recalled, and already-started Pi model switching is still non-atomic.

### Context adequacy receipts

`/why` distinguishes prepared input from classifier invocation and unknown provider delivery. Projection-only included user/assistant/summary counts, observed omitted tools/reasoning/images/custom/recognized-skill categories, byte/message clipping and partial-observation flags contain no text. Observation work is capped at 4,096 entry/tail/block visits and may stop earlier at history limits; counts are **not exhaustive**. Summary freshness is unknown, not a stale-content detector. Selector-budget message removal is a separate count. Neither receipt proves relevance, completeness, redaction or semantic accuracy. Projection receipts are runtime-only and never added to strict `RoutingContext` payloads; core decision receipts retain non-content budget counts.

The on-demand execution-context pressure view uses Pi's public token estimate divided by the last selected model's advertised window. It is approximate, can be unknown after compaction, and is not a final-payload/tokenizer/output-reserve capacity guarantee. It does not influence routing or change compaction.

## How inheritance and availability work

`inherit` means Pi's trusted configured defaults, **not whichever model ran your last task**:

1. Resolve Pi's effective configured provider/model; if unset or unknown to Pi's registry, use the original startup pair.
2. Resolve effort from Pi's per-model default, then its global default, then the original startup effort.
3. Re-read inherited defaults on reload without saving or migrating Pi's settings.

Overriding `default` changes this package's default execution role and, unless an independent profile is set, its selector. Manual session changes and explicit caller choices take precedence over automatic routing.

Unavailable, unauthenticated, or out-of-scope models remain in your YAML and appear with warnings. They are not eligible candidates; the menu checks availability again before saving a chosen model. Image attachments or images retained in conversation context prevent selection of text-only execution models. The selector itself receives no image bytes.

Normal fallback is **configured default → inherited Pi baseline → current permitted, usable model**, skipping duplicate model identities. If no option is usable, Pi or the API caller handles the error. Explicit invalid API model pins are not silently replaced. An empty Pi scope means normal unscoped operation; an explicit empty API allowlist means no models are permitted.

## Recover from a problem

| Problem | What to do |
| --- | --- |
| Automatic selection is not running | Check the footer for `auto-selector=disabled`, then run `/model-roles enable`. Default-only configuration intentionally makes no selector request. |
| A model is marked unavailable | Configure/authenticate its provider in Pi, choose another role model, or restore default inheritance. Refresh model availability using Pi's normal controls. Role reload alone does not probe providers. |
| YAML is invalid | Settings reports the file path. Correct the reported field/location manually, then run Pi's `/reload`. Settings does not overwrite or reset invalid data. |
| An external edit does not appear | Run Pi's `/reload` in each affected session. There is no file watcher. |
| A save reports `conflict` | Reload and review a fresh draft. Role/context drafts remain revision-checked; toggles alone rebase their one field. Never force an overwrite. |
| A save reports `lock_busy` or `permission_denied` | Wait for the active writer or repair permissions, then retry. A failed toggle stays locally paused. No lock is automatically removed. |
| A warning says saved but status/notification failed | The write already committed. Reload/check state before doing anything else; do not assume rollback. |
| `config.yaml.lock` remains after a crash | First verify that no Pi process is writing this configuration. Only then remove that lock directory. Locks are never automatically stolen. |
| Reset or save still fails | Check file permissions and path type. Symlinks, nonregular files, and oversized files may require manual repair before the menu can save. |

On a failed reload, the session retains its last valid in-memory configuration and shows a warning; the invalid file is left intact. If the first load is invalid, Pi keeps its current model and the repair menu remains available.

To stop using the package without losing roles, run `/model-roles disable` or follow the [removal instructions](../README.md#update-or-remove).

## Advanced limits and safeguards

These limits protect configuration and selection; they do not truncate or rewrite the task Pi will execute.

| Limit | Behavior |
| --- | --- |
| YAML size: 256 KiB, including serialized output | Oversized files/saves are rejected. Duplicate keys, explicit tags, aliases, merge expansion, malformed types, and unknown fields are also rejected. Errors use safe field paths or line/column positions, not source snippets. |
| Task text: 16,384 Unicode characters | Larger tasks skip classification and use fallback. Blank/image-only tasks also use default. |
| Selector context budget | UTF-8 bytes of its system/data payload, plus 2,048 output tokens and 1,024 overhead, must fit the selector context window. Conversation mode drops oldest optional history first; if task/roles still cannot fit, classification is skipped. |
| Conversation projection | At most 12 messages, 4 KiB UTF-8 each, 16 KiB total; no configurable larger limits. |
| Selector output: 2,048 tokens requested; 16,384 UTF-8 bytes accepted | Prompt mode requires exact JSON such as `{"matches":["quick"]}`. Conversation mode requires `{"action":"classify","matches":["quick"]}` or `{"action":"continue","matches":[]}`. Extra fields, duplicate/unknown IDs, nonempty continuation matches, code fences, tool output, malformed or incomplete/error responses fall back. |

Selector data contains sorted eligible role IDs/descriptions and submitted task text; conversation mode adds the bounded projection and previous role identifier, never new execution authority. One clear match selects a role; zero or multiple matches use default unless a valid contextual continuation is requested. There is at most one request per eligible idle primary-TUI submission and no retry. Oversized task text is skipped intact, not truncated or summarized.

Registered prompt templates (including `/plan <description>`) and `/skill:name <task>` are eligible under the same rules without additional configuration. Their raw command name and arguments count as task text, including for the size limit. Even a command without arguments can be classified from its name; an unclear match falls back to default. Include a task description when the command name alone does not explain your intent. Extension-owned commands remain excluded from automatic input routing, but `/model-roles run /command [arguments]` explicitly selects before invoking a registered command. It uses the same configuration, selector deadline, raw-text limit, fallbacks, and manual/disabled state; there is no new YAML option. Unknown commands are rejected before selection or execution. The wrapper does not read referenced plan files for classification—a path alone may not give enough task detail to distinguish roles. Use `/model-roles use <role>` when you need a specific role. See [command routing and recovery](compatibility.md#run-an-extension-owned-command).

Prompt mode does not collect conversation/reasoning/tool history, expanded template/skill bodies, command descriptions/source paths, system prompts, or context files for classification. Conversation mode adds only the bounded projection described above; it does not inspect referenced files. Text pasted into a submitted task (or supplied by an earlier input-transforming extension) is still task text and may be sent; there is no reliable secret-redaction guarantee. Auto Setup research/refinement stays on its original model/effort without independent routing. Per-turn and automatic-child routing are [unsupported on the tested host](compatibility.md#per-turn-routing-is-not-supported); there is no YAML flag that enables them.

Saves use a per-store queue, an exclusive lock with a 2-second wait, revision checks for drafts, a private temporary file, file sync, and atomic rename. Enable/disable reads fresh locked state and changes only that field; true no-ops preserve formatting. Replacement data is parsed/validated before commit. Failures report a safe category and optional field path, never raw configuration/provider error text; post-commit UI failures are reported separately. Directory sync is best effort. New directories/files request `0700`/`0600` permissions where supported. Final-file symlinks and nonregular paths are rejected; parent directories are assumed to be trusted local storage, not a security sandbox.
