# Changelog

## 0.1.0 — Unreleased

- Add a single inherited `default` role, native `/model-roles` menus, and cancel-safe custom role editing.
- Persist strict version-1 YAML outside the package installation, with atomic conflict-aware saves and explicit recovery/reset.
- Route new idle interactive tasks through at most one default-model selector; preserve manual/startup/caller choices and use finite capability-aware fallbacks.
- Keep descriptions out of execution prompts; record only safe decision/selector-usage metadata.
- Export a non-mutating selection API and session-targeted event service; include an opt-in tested native pi-subagents example.
- Add credential-free unit/SDK/storage/menu/package validation and a manual terminal checklist.

Initial compatibility: Node >=22.19.0, Pi 0.85.1, optional pi-subagents 0.65.1. See `docs/compatibility.md` for the in-flight Pi model-setter limitation and outstanding visual TUI verification. Public publication and licensing are not part of this implementation.
