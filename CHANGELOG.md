# Changelog

User-visible changes to pi-model-roles. For installation and everyday use, start with the [README](README.md).

## 0.1.0 — Unreleased

### Auto Setup

- Add an optional primary-TUI Auto Setup flow: select up to eight cached available models, ask the current Pi model to research them with its configured tools when available, then review/discuss/cancel a bounded proposal before any role save.
- Show mixed per-model evidence states, agent-reported citations and caveats, exact-model identity limits, offline/no-evidence outcomes, and reasoned role/effort recommendations. Auto Setup does not bundle a search provider, credentials, a benchmark database, or a tool sandbox.
- Give the research agent the exact bounded proposal contract used by the review handoff, preventing otherwise-valid reports from being rejected solely for undocumented field names.
- Preserve active model/effort, routing mode, top-level role settings, and untouched unavailable roles. Users explicitly choose conflict/default/custom-role replacement behavior and separately confirm first-custom-role routing effects.
- Add immediate proposal-authority cancellation, settled-only review readiness, conservative review-only session-draft restoration, and revision-bound atomic configuration application.

### Model roles

- Start with one `default` role that inherits Pi's model and thinking effort. Default-only use adds no selector request.
- Manage custom roles through `/model-roles`: describe when to use each role, select its model and effort, then confirm the save.
- Choose a role automatically for each new idle interactive prompt using at most one request to the default model. Use a safe fallback when no role clearly matches or selection fails.
- Preserve manual and explicit startup/caller choices. Pause/resume automation or apply a named role yourself.

### Configuration and privacy

- Save roles in a user-wide YAML file outside the installed package so they survive updates and removal. Detect invalid configuration and conflicting saves without silently overwriting user data.
- Send task text and role descriptions to the selector, not conversation history or images. Role descriptions do not become execution instructions. The selected execution provider receives Pi's normal conversation and attachments.
- Report safe decision details and separate selector usage without creating a routing log or duplicating task text in routing metadata.

### Integrations and documentation

- Load the Pi extension from packaged TypeScript source so GitHub installation and updates work without a manual build step; keep compiled `dist/` output for standalone API consumers.
- Provide a non-mutating selection API and session-targeted event service for explicit integrations. Include an optional native pi-subagents example; do not automatically intercept other launchers.
- Document installation from [github.com/spksoft/pi-model-roles](https://github.com/spksoft/pi-model-roles) with no post-install build step.
- Organize guides around getting started, how selection works, configuration, troubleshooting, and integration. Add contributor guidance to keep related user documentation updated with user-visible changes.
- Include credential-free unit/integration/package checks and a [manual terminal checklist](https://github.com/spksoft/pi-model-roles/blob/main/test/manual/tui-checklist.md).

### Compatibility and known limitations

Requires Node.js **22.19.0 or newer**; tested with **Pi 0.85.1** and optional **pi-subagents 0.65.1**. An already-started Pi model switch cannot be cancelled atomically, and human visual TUI acceptance is not yet claimed. See [compatibility](docs/compatibility.md) for details.

The package remains `UNLICENSED`; no public npm release is assumed.
