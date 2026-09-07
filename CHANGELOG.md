# Changelog

User-visible changes to pi-model-roles. For installation and everyday use, start with the [README](README.md).

## 0.1.0 — Unreleased

### Routing safety review

- Withdraw the per-turn/full-history routing experiment: Pi 0.85.1 captures the dispatch model/effort before `context`, so switching there routed the actual call on the previous pair. Restore supported pre-submission idle-TUI routing and document excluded prompt sources.
- Withdraw automatic pi-subagents background launching. `createPiSubagentsBackgroundBridge` and `piSubagentRoutingDiagnostic` report `automatic_child_routing_unsupported` without registration, RPC, timers, or launch. The old child entry is inert; explicit pre-launch selection remains available with caller pins/scopes and launcher authority preserved.
- Keep skill/tool/history text out of automatic selector data, preserve Auto Setup research/refinement model and effort, and align live consent with task-only routing. Pasted task content is not secret-filtered.
- Surface swallowed faux-provider callback assertions, assert actual dispatch pairs outside provider callbacks, and restore compaction/queue/application-race regressions. Add synthetic skill/file privacy, empty/image-only input, and fail-closed bridge coverage. No live-provider or visual TUI acceptance is claimed.

### Auto Setup

- Add an optional primary-TUI Auto Setup flow: select up to eight cached available models, ask the current Pi model to research them with its configured tools when available, then review/discuss/cancel a bounded proposal before any role save.
- Share the bounded model picker with role editing. Auto Setup retains up to eight checked candidates across searches/pages, with Space or Tab to toggle.
- Show mixed per-model evidence states, agent-reported citations and caveats, exact-model identity limits, offline/no-evidence outcomes, and reasoned role/effort recommendations. Research and refinement now use a shared role-design rubric, positive/negative few-shot descriptions, and pairwise overlap checks to favor a small set of task-observable routing criteria. Auto Setup does not bundle a search provider, credentials, a benchmark database, or a tool sandbox.
- Expose the complete nested Auto Setup tool schema instead of an untyped proposal; document `caveats` as a bounded string array in research and refinement prompts. Cover the reported scalar-caveat failure through Pi 0.85.1's schema-based argument conversion.
- Report safe validation field paths and instruct the agent to make one correction attempt with the same request ID/generation, replacing the conflicting exactly-once submission instruction. Accepted, cancelled, and stale requests retain their existing authority checks.
- Preserve active model/effort, routing mode, top-level role settings, and untouched unavailable roles. Users explicitly choose conflict/default/custom-role replacement behavior and separately confirm first-custom-role routing effects.
- Add immediate proposal-authority cancellation, settled-only review readiness, conservative review-only session-draft restoration, and revision-bound atomic configuration application.

### Model roles

- Simplify `/model-roles` to Settings, Enable/Disable Auto Selector, and Use-role subcommands. The footer now states `auto-selector=enabled|disabled`; direct role use preserves that state, so enabled routing may choose another role on the next eligible prompt while disabled routing pins the selected/current role.
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
- Send task text and role descriptions to the selector, not conversation history or images. Role descriptions do not become execution instructions. The selected execution provider receives Pi's normal conversation and attachments.
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
