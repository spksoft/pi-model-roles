# Native TUI acceptance checklist

Status: **not yet human-verified**. Automated fake-UI/SDK tests cover workflow state and cancellation, not visual/IME behavior. Do not check these boxes without doing the corresponding test.

Use a disposable `PI_CODING_AGENT_DIR` and synthetic task/role descriptions. Configure only a fake provider for offline checks. Do not use live accounts unless separately approved. Load the prebuilt `dist/extension.js` in Pi 0.85.1.

- [ ] First activation exposes `/model-roles`; exactly one inherited default; no onboarding, model switch, or classifier request.
- [ ] Default is listed first; config path and resolved inherited model/effort are readable. Default has no Delete/Rename action.
- [ ] Add a role with keyboard only. Enter multiline English/non-English text and an IME-composed description; explicitly choose model and effort. Review and cost/provider disclosure are clear.
- [ ] Cancel at ID, description, model, effort, review, and first-role disclosure; no file/model changes occur.
- [ ] Edit default to a concrete model, then restore inheritance. Pi's saved defaults remain unchanged.
- [ ] Test long provider/model names at widths 40, 80, and 120 columns; resize with a native dialog/loader open. No rendering exceptions or unusable controls.
- [ ] Test light/dark themes, visible focus, keyboard selection, Escape, and textual status without relying solely on color.
- [ ] Submit a task with custom roles. Selector runs once on default; execution uses the selected role. Tool turns/queued follow-ups retain that model.
- [ ] Escape during the selector loader cancels execution and restores task text. Verify the image reattachment warning using a synthetic attachment.
- [ ] Manual model/effort changes pause routing. `/model-roles auto` resumes on the next prompt, without a request immediately. Reload preserves authority.
- [ ] Show Status: reason, effective/requested effort, fallback, and separate selector usage; no task/description/raw response is displayed there.
- [ ] Delete the last custom role; return to zero-selector routing. Disable leaves the active pair unchanged.
- [ ] Exercise unavailable-model warnings, malformed YAML retention, a conflicting external edit, and an abandoned lock. No forced overwrite; bounded recovery guidance.
- [ ] Confirm Reset affects only package YAML; cancelling Reset leaves it intact.
- [ ] Disable/remove the package and restart; ordinary Pi behavior returns and YAML remains available for reinstall.

Record Pi/Node/OS/terminal versions, widths/themes, date, result per item, and any remaining failures. No screenshots/transcripts should contain credentials, personal prompts, or private configuration. An interrupted **already-started Pi model setter** is subject to the limitation in `docs/compatibility.md`; do not describe that race as atomically solved.
