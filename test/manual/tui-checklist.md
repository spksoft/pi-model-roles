# Manual terminal acceptance checklist

[← README](../../README.md) · [Architecture](../../docs/architecture.md) · [Compatibility and known limits](../../docs/compatibility.md)

**Status: not yet human-verified.** This is a maintainer checklist, not a setup requirement for users. Automated fake-UI/SDK tests cover workflow state and cancellation; they do not establish visual, keyboard, or IME behavior. Check a box only after performing that test.

## Prepare a safe test session

1. Use Pi **0.85.1** and Node.js **22.19.0 or newer**. Record the exact Pi/Node/OS/terminal versions.
2. Prepare a separate development clone with `npm ci --ignore-scripts`. Do not edit Pi's managed GitHub checkout for development.
3. Use a new, disposable `PI_CODING_AGENT_DIR`, not your normal agent directory. From the development clone, start Pi with that directory and `-e ./src/extension.ts`; avoid loading a second installed copy.
4. Use synthetic task text, role descriptions, and image attachments. Configure a fake provider for offline routing checks. If no test provider is available, mark provider-dependent checks **not run**, not passed. Use live accounts only with separate approval.
5. Prepare terminal widths of 40, 80, and 120 columns and light/dark themes. Include multiline non-English input and an input method editor (IME).

The separate [GitHub installation flow](../../README.md#quick-install) must expose `/model-roles` after install or update without a manual build. Test that flow in a disposable agent directory when validating installation changes; do not claim a live GitHub install was checked merely because local extension loading worked.

## First use and role management

- [ ] First activation exposes `/model-roles` with exactly one inherited `default`; no onboarding, model switch, or selector request occurs.
- [ ] `/model-roles` completion offers only Settings, the currently relevant Enable/Disable Auto Selector action, and Use entries for configured roles. Removed status/reload/pause/auto/auto-setup command paths show bounded usage guidance.
- [ ] Settings puts Auto Setup first, then lists roles with CRUD-only controls. Default has no Delete/Rename action; no use, move, selector toggle, global toggle, reload, status, or reset action appears.
- [ ] Add, edit, and delete a custom role with keyboard only: A/Enter/D, arrows or j/k, and Escape. Enter multiline English/non-English and IME-composed text; choose a model and effort explicitly. Review and cost/provider disclosure are understandable.
- [ ] With a synthetic catalog spanning three providers and 100+ models, exercise **Add role**, **Edit custom role**, and **Edit default** through `/model-roles settings`. Each model picker shows at most eight rows, a page indicator, and an immediately active search field. Type provider/model fragments, including j/k/H/L and slashes; verify fuzzy results, PgUp/PgDn, arrow wrapping, no matches, Backspace, Ctrl+U, Enter, and Escape/Ctrl+C. Default inheritance stays searchable and exact slash-containing IDs save correctly.
- [ ] Cancel at identifier, description, model (also with an active query), effort, review, and first-role disclosure. No file/model changes occur.
- [ ] Edit default to a concrete model, then restore inheritance. Pi's saved defaults remain unchanged.
- [ ] Run `/model-roles use <role>` while Auto Selector is enabled. It applies without a selector request, the footer retains `auto-selector=enabled`, and the next eligible prompt may route elsewhere. Disable Auto Selector, use a different role, and verify that role stays pinned.
- [ ] Delete the last custom role and return to zero-selector routing. Deletion does not change the active model.

## Readability and keyboard access

- [ ] Long provider/model names remain usable at 40, 80, and 120 columns. Resize model pickers on a later page at 8, 12, and 24 rows: the page shrinks and the highlighted model remains visible without width overflow. Check IME candidate positioning in the search field and configured `tui.select.*` bindings. Resize other dialogs/selector loaders too; no rendering exceptions occur.
- [ ] Light/dark themes show visible focus, keyboard selection, Escape behavior, and readable status without relying solely on color.

## Auto Setup research and review

- [ ] In a disposable primary TUI session, open **Auto Setup**, choose one to eight cached models with Space/Tab, arrows, and Enter; verify the ninth selection is refused. Type directly to fuzzy-search and use PgUp/PgDn to change pages. Selections persist across searches/pages; clearing the query and unchecking a hidden selection works. Escape/Ctrl+C cancel immediately, including with an active query, without an Auto Setup request or role-file change. Try long/non-English model IDs at 40, 80, and 120 columns in light and dark themes.
- [ ] Read the start disclosure. Verify it names the current model, distinguishes normal model/tool data flow and possible charges from future selector charges, says tools are not sandboxed, and explains the offline/no-evidence fallback.
- [ ] With an approved synthetic or fake search setup, verify a proposal remains unavailable until the normal agent settles, then the review opens automatically without another command. Verify source status/URLs/dates/caveats, unresolved identity, offline/no-evidence, and a report that recommends no configuration change. For role recommendations, verify each description begins with “Use when”, uses an observable trigger and near-miss boundary, contains no execution/model claims, and does not overlap; use Discuss/refine to test that the same rubric and automatic review are retained. Do not mark live-provider behavior passed without separate approval.
- [ ] With synthetic data on Pi 0.85.1, submit valid array caveats and scalar-string caveats in separate setup passes; verify the latter is converted to an array and both produce a settled review draft without saving role YAML. Submit an over-limit caveat array, then correct it with the same request ID/generation; verify the error identifies the field and the corrected report becomes ready. Check that research/refinement instruct only one correction attempt and no retry after acceptance or cancellation.
- [ ] Use **Discuss/refine** with keyboard and IME-composed text. Verify it creates a new explicit setup exchange, ordinary chat is not silently captured, and the model/effort do not change during guarded research/refinement.
- [ ] Press Escape while a setup turn has active tools. Verify the normal agent stops cooperatively and no role YAML changes. After a settled proposal, choose **Cancel proposal** in the automatic review and verify the draft is discarded.
- [ ] Review a proposal against existing roles. Verify keep/add, individual replacements, changed-default choice, and destructive replace-custom-roles confirmation show exact before/after model, effort and description values—not just change labels. Retained conflicts/default are absent from the diff; delete/re-add of the same ID shows the final replacement once. Decline each confirmation, including first-custom-role routing disclosure, and verify YAML remains unchanged.
- [ ] Verify disclosure mentions sending existing role descriptions/settings. With synthetic roles, inspect research and refinement context for exact supported efforts, modalities and context windows of every selected candidate (including unused ones), plus existing role boundaries and inherited/overridden default. No provider credentials or extra registry fields are copied. An oversized configuration prompt is refused before dispatch with manual-edit recovery guidance.
- [ ] Inspect model/effort rationale, trade-offs, evidence models, optional default explanation, source publication/access dates, benchmark conditions and upstream mapping source numbers. Confirm they are readable at narrow widths and explicitly agent-reported. Compare synthetic clear matches, near-misses, cross-role tasks, “continue” and mixed intents; do not treat generated examples as executed evaluations. Use Discuss/refine to change cost/reliability priorities and check retained-role overlaps after a partial merge.
- [ ] Confirm an additive proposal while an unrelated saved role is unavailable; the unchanged role remains with its warning. Change YAML in another session before final confirmation and verify Auto Setup requires a fresh review rather than forcing a save.
- [ ] Reload/navigate after a settled draft and verify it is review-only. Exercise a malformed/cancelled/applied marker with synthetic session data when supported; no historical draft should silently become actionable.

## Selection and user control

- [ ] Submit two idle tasks selecting different pairs. Verify the actual fake-provider model/effort on each request, not only the footer. The selector runs once per eligible submission; tool loops and queued follow-ups are not independently rerouted.
- [ ] Read first-role consent: it must say task text and role descriptions, no automatic history collection, no tool-loop rerouting, and warn that pasted task text is not secret-filtered. Verify synthetic skill expansion and file-tool history never appear in a later selector request.
- [ ] Run Auto Setup research and Discuss/refine with existing custom roles and then an overridden default. Both retain the original actual model/effort and proposal authority.
- [ ] Try the automatic-child compatibility probe with pi-subagents absent and enabled. Both return unsupported without registering or launching anything. A stale dedicated child entry with an apparent binding also stays inert; explicit pre-launch selection continues to preserve caller pins and launcher restrictions.
- [ ] Check no-match and overlapping descriptions. Default fallback is visible rather than silently choosing the first custom role.
- [ ] Press Escape during the selector loader. Execution is cancelled and task text is restored. Verify the image reattachment warning with a synthetic attachment.
- [ ] Change model/effort manually. The footer shows `auto-selector=disabled`; `/model-roles enable` resumes on the next eligible prompt without sending a request immediately. Reload preserves manual authority.
- [ ] Run `/model-roles disable` and confirm the selected/current role, model, and effort stay unchanged across ordinary prompts. The footer visibly shows `auto-selector=disabled`; `/model-roles enable` restores routing.

## Recovery and removal

- [ ] Exercise unavailable-model warnings and malformed YAML retention. A failed reload retains the last valid settings with a warning; a cold invalid load preserves the current Pi model and allows repair.
- [ ] Make a conflicting external edit and test an abandoned lock in the disposable directory. Saves do not force overwrites, and recovery guidance is bounded. Remove a lock only after verifying no writer is active.
- [ ] Change a role in one session, then reload another. Saved changes become visible without assuming a background watcher.
- [ ] Back up and manually reset package YAML, run Pi's `/reload`, and verify Pi defaults remain unchanged. Settings itself offers no reset operation.
- [ ] Disable/remove the package and restart. Ordinary Pi behavior returns, while role YAML remains available for reinstall.

## Record results

Record the date, Pi/Node/OS/terminal versions, widths/themes, pass/fail/not-run result per item, and remaining issues. Never include credentials, personal prompts, private configuration, or sensitive screenshots/transcripts.

An interrupted **already-started Pi model switch** is subject to the [host limitation](../../docs/compatibility.md#model-switch-limitation). Do not describe that race as atomically solved, even if a manual run happens to preserve the intended model.
