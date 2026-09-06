# Manual terminal acceptance checklist

[← README](../../README.md) · [Compatibility and known limits](../../docs/compatibility.md)

**Status: not yet human-verified.** This is a maintainer checklist, not a setup requirement for users. Automated fake-UI/SDK tests cover workflow state and cancellation; they do not establish visual, keyboard, or IME behavior. Check a box only after performing that test.

## Prepare a safe test session

1. Use Pi **0.85.1** and Node.js **22.19.0 or newer**. Record the exact Pi/Node/OS/terminal versions.
2. Build a separate development clone with `npm ci --ignore-scripts` and `npm run build`. Do not edit Pi's managed GitHub checkout for development.
3. Use a new, disposable `PI_CODING_AGENT_DIR`, not your normal agent directory. From the development clone, start Pi with that directory and `-e ./dist/extension.js`; avoid loading a second installed copy.
4. Use synthetic task text, role descriptions, and image attachments. Configure a fake provider for offline routing checks. If no test provider is available, mark provider-dependent checks **not run**, not passed. Use live accounts only with separate approval.
5. Prepare terminal widths of 40, 80, and 120 columns and light/dark themes. Include multiline non-English input and an input method editor (IME).

The separate [GitHub installation flow](../../README.md#install-from-github) requires a build after install and update. Test that flow in a disposable agent directory when validating installation changes; do not claim a live GitHub install was checked merely because local extension loading worked.

## First use and role management

- [ ] First activation exposes `/model-roles` with exactly one inherited `default`; no onboarding, model switch, or selector request occurs.
- [ ] Default appears first. The configuration path and resolved inherited model/effort are readable, and default has no Delete/Rename action.
- [ ] Add a role with keyboard only. Enter multiline English/non-English and IME-composed text; choose a model and effort explicitly. Review and cost/provider disclosure are understandable.
- [ ] Cancel at identifier, description, model, effort, review, and first-role disclosure. No file/model changes occur.
- [ ] Edit default to a concrete model, then restore inheritance. Pi's saved defaults remain unchanged.
- [ ] Use a named role from the menu and `/model-roles use <role>`. It applies without a selector request and pauses automation.
- [ ] Delete the last custom role and return to zero-selector routing. Deletion does not change the active model.

## Readability and keyboard access

- [ ] Long provider/model names remain usable at 40, 80, and 120 columns. Resize with a dialog or selector loader open; no rendering exceptions or unusable controls occur.
- [ ] Light/dark themes show visible focus, keyboard selection, Escape behavior, and readable status without relying solely on color.

## Selection and user control

- [ ] Submit an idle task with eligible custom roles. The selector runs once on default and execution uses the selected role. Tools and queued follow-ups retain that model.
- [ ] Check no-match and overlapping descriptions. Default fallback is visible rather than silently choosing the first custom role.
- [ ] Press Escape during the selector loader. Execution is cancelled and task text is restored. Verify the image reattachment warning with a synthetic attachment.
- [ ] Change model/effort manually. Routing pauses; `/model-roles auto` resumes on the next eligible prompt without sending a request immediately. Reload preserves manual authority.
- [ ] Disable global routing and confirm the current pair stays unchanged. `/model-roles auto` alone does not override the global disable; enabling and resuming restores routing.
- [ ] Open Status. Check reason, requested/effective effort, fallback, and separate selector usage when available. No task text, role description, or raw provider response appears there.

## Recovery and removal

- [ ] Exercise unavailable-model warnings and malformed YAML retention. A failed reload retains the last valid settings with a warning; a cold invalid load preserves the current Pi model and allows repair.
- [ ] Make a conflicting external edit and test an abandoned lock in the disposable directory. Saves do not force overwrites, and recovery guidance is bounded. Remove a lock only after verifying no writer is active.
- [ ] Change a role in one session, then reload another. Saved changes become visible without assuming a background watcher.
- [ ] Confirm Reset affects only package YAML and warns that custom roles will be lost. Cancelling Reset leaves it intact.
- [ ] Disable/remove the package and restart. Ordinary Pi behavior returns, while role YAML remains available for reinstall.

## Record results

Record the date, Pi/Node/OS/terminal versions, widths/themes, pass/fail/not-run result per item, and remaining issues. Never include credentials, personal prompts, private configuration, or sensitive screenshots/transcripts.

An interrupted **already-started Pi model switch** is subject to the [host limitation](../../docs/compatibility.md#model-switch-limitation). Do not describe that race as atomically solved, even if a manual run happens to preserve the intended model.
