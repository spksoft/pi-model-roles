# Changelog

User-visible changes to pi-model-roles. For installation and everyday use, start with the [README](README.md).

## 0.1.0 — Unreleased

### Native integration verification

- Fail fast with an actionable parent-context diagnostic when the native pi-subagents test is invoked in a child process. Document the pi-subagents 0.65.1 import-time event-owner constraint instead of misattributing the example's 30-second no-response timeout to child execution. Preserve all native completion/model/effort assertions and launcher safety policies; no parent runtime routing change.

### Bounded selector upgrades

- Require explicit matching, verified selector effort for scoped thinking pins; refuse unverified configured-provider streamSimple effort forwarding. Reject coercible evaluation labels/malformed records and stop on configured selector deadlines even without a usable fallback.
- Add an optional independent selector model/effort profile and `/model-roles selector` choose/reset disclosure flow. Preserve legacy options when absent, exact scope, execution defaults and Auto Setup settings. Explicit unsupported effort falls back without a selector-provider retry; Pi effort forwarding is currently verified for OpenAI Responses only.
- Add `/model-roles context-session [prompt|conversation|inherit]`: informed conversation opt-in and immediate prompt-only override without file/session-entry writes. Logical-session UUID + agent-directory policy survives reload/tree/revisit within this process; simultaneous same-key hosts share it. Restart/new/fork uses global; capacity refuses new overrides rather than evicting opt-outs.
- Add non-content projection category/partial-observation/clipping receipts, separate selector-budget trimming and unknown summary freshness to `/why`, plus approximate on-demand execution-context pressure without changing Pi compaction.
- Add bounded opt-in paired prompt/context/fixed-baseline evaluation and diverse synthetic fixtures. The credential-free demo is explicitly a harness check, not semantic benchmark evidence. No live evaluation, superiority claim, new automatic-child/mid-task integration or equivalent-pair shortcut is included.

### Context-aware idle routing and reliable toggles

- Fix enable/disable persistence: pause locally before saving, keep failed toggles paused, and resume enable only after a successful save in the unchanged session. Update only `enabled` against fresh locked disk state, preserving unrelated edits and checking same-value requests too. Role drafts remain revision-checked.
- Report safe save error categories/fields and recovery guidance. Separate committed writes from later status/notification failures so a successful save is not reported as rolled back.
- Add opt-in `selectorContext: conversation` and `/model-roles context [prompt|conversation]` with explicit sharing consent. Omitted/`prompt` stays prompt-only with unchanged initial YAML. Collect at most 12 retained active-branch text messages/summaries, 4 KiB each and 16 KiB total, with optional oldest-history removal for budget. No extra summarizer, tool calls, per-turn routing, or compaction changes.
- Exclude raw thinking, tool calls/results, images, arbitrary custom entries and recognized skill bodies. Visible dialogue/summaries and unmarked template expansions can still contain sensitive copied text; this is not secret redaction. Opt-out does not undo prior transmission.
- Introduce strict contextual classify/continue responses and validate continuation against the current eligible role/model/effort. Reclassify changed scope/intent; preserve explicit pins, manual state, image eligibility and safe fallback. Invalidate pending results on retained-history/configuration changes and compaction.
- Add `/model-roles why` with metadata-only last-decision explanations and the explicit direct `selectModelWithContext` API. Existing v1 library/event APIs and the command wrapper remain prompt-only. Auto Setup describes but cannot change the context policy.
- Add credential-free projection, protocol, SDK context/consent, persistence and recovery regressions; update user guidance and manual acceptance checks. Live semantic accuracy and visual terminal acceptance are not established by these tests.

### Explicit command routing

- Add `/model-roles run /command [arguments]` to select/apply a parent model before invoking an existing extension-owned command such as `/execute-plan` through Pi's public API. No edits to Pi, planning packages, providers, or runners are required; original command names/handlers stay unchanged.
- Reuse normal role policy, manual/disabled state, default-only zero-request behavior, limits, cancellation and fallbacks. Select only from raw target text; preserve exact arguments without reading plan files or classifying generated kickoff prompts. Generated inputs and child models are not independently rerouted.
- Refuse busy/queued work, unknown/built-in targets and recursive model-roles calls. Recheck session and public command ownership before dispatch, invalidate pending selection on intervening agent starts, and restore the full wrapper on cancellation. Never retry target commands or claim completion from fire-and-forget dispatch.
- Cover real-SDK command delegation, parent overrides, target errors, privacy, manual pins, model-application races, session invalidation and stale ownership. Document text-only input, selector costs, target authority and recovery; expand command completion and first-role consent.

### Slash-prompt routing

- Fix the blanket slash-input bypass: registered prompt templates such as `/plan <description>` and `/skill:name <task>` now select once before expansion in idle primary-TUI sessions. Only the raw command and arguments reach the selector, not resource bodies or command metadata.
- Preserve manual/disabled routing, default-only zero-request behavior, cancellation, fallback, queue and Auto Setup safeguards. Extension-owned commands still bypass Pi's input hook; unknown slash commands remain excluded. No upstream package or private host API changes are required.
- Add real-SDK synthetic command regressions that verify actual dispatch pairs, privacy and unchanged expansion rather than just footer state; clarify supported command types and recovery in user guidance.

### Routing safety review

- Withdraw the per-turn/full-history routing experiment: Pi 0.85.1 captures the dispatch model/effort before `context`, so switching there routed the actual call on the previous pair. Restore supported pre-submission idle-TUI routing and document excluded prompt sources.
- Withdraw automatic pi-subagents background launching. `createPiSubagentsBackgroundBridge` and `piSubagentRoutingDiagnostic` report `automatic_child_routing_unsupported` without registration, RPC, timers, or launch. The old child entry is inert; explicit pre-launch selection remains available with caller pins/scopes and launcher authority preserved.
- Keep skill/tool/history text out of default prompt-only selector data, preserve Auto Setup research/refinement model and effort, and align live consent with the configured routing policy. Pasted task content is not secret-filtered.
- Surface swallowed faux-provider callback assertions, assert actual dispatch pairs outside provider callbacks, and restore compaction/queue/application-race regressions. Add synthetic skill/file privacy, empty/image-only input, and fail-closed bridge coverage. No live-provider or visual TUI acceptance is claimed.

### Auto Setup

- Give research and refinement an allowlisted, bounded snapshot of existing roles/settings and exact candidate capabilities; refinement no longer relies on conversation history for supported efforts or unused models. Disclose the added configuration context and reject over-limit prompts before dispatch.
- Apply prompt/context-engineering guidance to task-fit comparisons, whole-task routing boundaries, existing-role overlap checks, provisional effort selection, default/selector trade-offs, and targeted public-model research. Request reviewable synthetic match/near-miss examples without claiming measured accuracy; keep the proposal/YAML schemas and top-level settings unchanged.
- Show effort rationales, evidence-model references, trade-offs, default recommendations, upstream mappings and benchmark conditions in review. Final confirmation now displays exact merged before/after role values rather than change labels alone.
- Add an optional primary-TUI Auto Setup flow: select up to eight cached available models, ask the current Pi model to research them with its configured tools when available, then review/discuss/cancel a bounded proposal before any role save.
- Share the bounded model picker with role editing. Auto Setup retains up to eight checked candidates across searches/pages, with Space or Tab to toggle.
- Show mixed per-model evidence states, agent-reported citations and caveats, exact-model identity limits, offline/no-evidence outcomes, and reasoned role/effort recommendations. Research and refinement now use a shared role-design rubric, positive/negative few-shot descriptions, and pairwise overlap checks to favor a small set of task-observable routing criteria. Auto Setup does not bundle a search provider, credentials, a benchmark database, or a tool sandbox.
- Expose the complete nested Auto Setup tool schema instead of an untyped proposal; document `caveats` as a bounded string array in research and refinement prompts. Cover the reported scalar-caveat failure through Pi 0.85.1's schema-based argument conversion.
- Report safe validation field paths and instruct the agent to make one correction attempt with the same request ID/generation, replacing the conflicting exactly-once submission instruction. Accepted, cancelled, and stale requests retain their existing authority checks.
- Preserve active model/effort, routing mode, top-level role settings, and untouched unavailable roles. Users explicitly choose conflict/default/custom-role replacement behavior and separately confirm first-custom-role routing effects.
- Add immediate proposal-authority cancellation, settled-only review readiness, conservative review-only session-draft restoration, and revision-bound atomic configuration application.

### Model roles

- Keep role management focused on Settings, Enable/Disable Auto Selector, and Use-role subcommands, alongside the explicit Run-command wrapper. The footer now states `auto-selector=enabled|disabled`; direct role use preserves that state, so enabled routing may choose another role on the next eligible prompt while disabled routing pins the selected/current role.
- Put Auto Setup first in Settings and make the remaining role surface CRUD-only, removing use, pause/global-toggle, reload, reset, and status operations from the role dashboard.
- Open Auto Setup review automatically after research or refinement settles, using a deferred idle callback rather than requiring a separate review command or blocking `agent_settled` dispatch.
- Strengthen generated role-description guidance as a compact classification prompt: “Use when” observable triggers, near-miss exclusions, and pairwise overlap checks.
- Fix model selection in role creation, custom-role editing, and default-role editing—not only Auto Setup. Every picker now shows at most eight models per page, shrinks on short terminals, and truncates text by display width.
- Match Pi's type-to-search behavior using its fuzzy matcher and input component: arrows/PgUp/PgDn navigate, Enter selects, Ctrl+U clears, and Escape/Ctrl+C cancel immediately. Honor configured selection bindings and forward input focus for IME positioning. Remove Auto Setup's separate `/` search mode and conflicting letter-navigation shortcuts.

- Start with one `default` role that inherits Pi's model and thinking effort. Default-only use adds no selector request.
- Manage custom roles through keyboard-first Settings: select a role and press Enter to edit, use A to create, or D to delete. Direct role use and Auto Selector enable/disable remain explicit command actions outside Settings.
- Choose a role automatically for each new idle interactive prompt using at most one request to the default model. Use a safe fallback when no role clearly matches or selection fails.
- Preserve manual and explicit startup/caller choices. Pause/resume automation or apply a named role yourself.

### Configuration and privacy

- Save roles in a user-wide YAML file outside the installed package so they survive updates and removal. Detect invalid configuration and conflicting saves without silently overwriting user data.
- By default send task text and role descriptions to the selector, not conversation history or images. The opt-in bounded conversation mode is described above. Role descriptions do not become execution instructions. The selected execution provider receives Pi's normal conversation and attachments.
- Report safe decision details and separate selector usage without creating a routing log or duplicating task text in routing metadata.

### Integrations and documentation

- Restructure user documentation: README now focuses on quick installation and Auto Setup-led quick use; dedicated guides cover configuration, architecture/routing flow, troubleshooting, and integration details.
- Load the Pi extension from packaged TypeScript source so GitHub installation and updates work without a manual build step; keep compiled `dist/` output for standalone API consumers.
- Provide a non-mutating selection API and session-targeted event service for explicit integrations. Include an optional native pi-subagents example; do not automatically intercept other launchers.
- Document installation from [github.com/spksoft/pi-model-roles](https://github.com/spksoft/pi-model-roles) with no post-install build step.
- Organize guides around getting started, how selection works, configuration, troubleshooting, and integration. Add contributor guidance to keep related user documentation updated with user-visible changes.
- Include credential-free unit/integration/package checks and a [manual terminal checklist](https://github.com/spksoft/pi-model-roles/blob/main/test/manual/tui-checklist.md).

### Compatibility and known limitations

Requires Node.js **22.19.0 or newer**; tested with **Pi 0.85.1** and optional **pi-subagents 0.65.1**. An already-started Pi model switch cannot be cancelled atomically, and human visual TUI acceptance is not yet claimed. See [compatibility](docs/compatibility.md) for details.

The package remains `UNLICENSED`; no public npm release is assumed.
