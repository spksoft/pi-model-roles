# Compatibility and verification

## Supported boundary

| Component | Initial verification target |
| --- | --- |
| Node.js | >=22.19.0; CI uses 22.19.0 |
| Pi host / AI / TUI peers | `@earendil-works/pi-{coding-agent,ai,tui}` 0.85.1 |
| Optional native subagent example | `pi-subagents` 0.65.1 |
| Automatic session | Primary `mode=tui`, new idle interactive non-streaming input |
| Headless / SDK / children | Explicit library/service integration, no ambient routing or config bootstrap |
| Distribution | Prebuilt npm tarball; ESM, declarations, no install/postinstall build |

Wildcard Pi peer ranges follow Pi package guidance; **they are not a claim that every Pi version works**. Test additional versions before expanding this matrix. Older package namespaces, external CLI model translation, universal tool interception, and distributed events are unsupported. The package does not modify Pi, pi-subagents, or their permission/launch policy.

## Host limits and safe operation

Pi 0.85.1 exposes model changes after asynchronous authentication, but `pi.setModel()` has **no AbortSignal or compare-and-set/generation argument**. Model/effort notifications also do not carry a unique operation ID.

The controller cancels/discards pending classifier results on manual changes, reload, navigation, and shutdown; revalidates before applying; uses expected-value event guards; prevents stale role effort application after an awaited switch; and tries to restore an intervening manual pair in the same active session. Tests verify these cases with delayed switching and non-cooperative classification.

However, an already-in-flight Pi model setter may briefly commit after cancellation. A concurrent session replacement/shutdown, repeated manual changes during repair, or an indistinguishable same-target notification **cannot be made fully atomic with the current public API**. A strict guarantee that every stale switch can never commit remains blocked on an upstream cancellable/CAS setter or operation provenance. No private patch or alternate runner is used to hide this limit. Wait for model switching to finish before changing sessions; reselect your intended model/effort if a switch was interrupted. `selectorTimeoutMs` does not bound Pi's separate model application or worker execution.

The input gate guarantees at most one selector for an eligible submission handled by this extension. Another extension earlier in the input chain may consume it, or a later extension may consume/transform it after selection. There is no universal ownership/priority mechanism for unrelated extensions. Raw slash expansions are bypassed rather than guessed.

SDK initial model-choice provenance is not universally available. Unknown headless hosts stay inactive; direct consumers supply explicit pins. Known pi-subagents child identity is captured at extension initialization. Other child hosts must integrate explicitly rather than relying on ambient auto-routing.

Only configuration structure can be validated without network access. Unknown/withdrawn models remain user data, visibly unavailable; cached registry eligibility is checked at use time. The API/role scope is advisory and does not bypass a launcher's security policy.

## Automated evidence

The full local gate passed on macOS with **Node 22.21.1**: **27 unit tests and 36 integration tests**, including the production-only tarball and native child tests. CI is configured for the declared 22.19.0 floor; that hosted CI run has not been executed in this session.

`npm run check` covers:

- format/lint and strict TypeScript, including negative public-contract fixtures;
- YAML schema/Unicode/size/duplicate/tag/alias validation and bounded serialized output;
- immutable configuration, stale-lock/symlink/permission errors, two-process conflicts, and injected before-write/before-rename/after-rename failures;
- precedence, exact identity, allowlists, image capability, semantic-output validation, deterministic fallback, Pi-compatible effort mapping, deadlines, independent cancellation, and privacy sentinels;
- read-only global/project defaults, trust and per-model effort;
- real Pi SDK initial activation, automatic/manual/reload behavior, invalid configuration, cancellation, headless/child bypass, and queued follow-ups;
- selected smaller-context model visible before real Pi compaction and subsequent execution, with native fake transport (no real provider/authentication);
- controller false/throw/effort failures, delayed model application, busy inputs, and manual/reload/tree/shutdown invalidation;
- native dialog draft cancellation, CRUD, required fields, protected default, manual role use, resume, and reset;
- session-targeted events, duplicate-owner suppression, cancellation/disposal, and native pi-subagents child model/effort forwarding;
- offline tarball installation with production dependencies and exact host peers, plain-Node API/extension loading without tsx/TypeScript/pi-subagents, file allowlisting, and YAML retention after executable removal.

All scenarios use synthetic task data and disposable agent roots. Native subagent fixture state has its own `PI_SUBAGENTS_TEMP_ROOT`; no launcher CLI fallback occurs. The SDK fake provider is provisioned through public runtime/extension APIs. The compaction fixture supplies Pi's public custom stream seam for an auth-free fake provider; this is not evidence of live-provider compaction behavior.

Install dependencies once (`npm ci --ignore-scripts`); ordinary tests use no live providers or credentials. The package smoke test reuses locked versions and npm's offline tarball cache. An empty/missing cache requires dependency provisioning, not a live-provider test.

Proactive `lsp_diagnostics` and final `lens_diagnostics(mode=all)` found no blocking errors. Pi Lens retains eight nonblocking maintainability advisories (schema/example complexity, explicit Promise bridging in cancellation helpers, and a filesystem fault-test's coordination). Repository lint is clean. Script output, not an absent diagnostics provider, is the compile/test authority.

## Remaining verification / deviations

- **Human visual TUI acceptance is not claimed.** Keyboard/IME, physical resizing, narrow terminals, and theme rendering need the [manual checklist](../test/manual/tui-checklist.md). Automated tests drive Pi's native dialogs/loaders but cannot attest to every terminal/IME.
- The strict atomic in-flight switch guarantee above remains a host API limitation; classification races and post-await effort safety are covered, but session-replacement races during an already-started host setter are not represented as solved.
- The plan's proposed small file modules were consolidated into `core/selection.ts`, `pi/adapters.ts`, `pi/controller.ts`, and `ui/menu.ts` where responsibilities remain cohesive. Public contracts are in `core/types.ts`; no separate runner or provider client was added.
- Runtime availability warnings are separate from structural YAML errors. This intentionally allows a temporarily unavailable configured role to survive until its provider returns.
- The pi-subagents package ships source rather than declaration-only imports. Its integration test loads it dynamically as an `ExtensionFactory`, exercises the real public runtime contract, and does not type-check or modify its internal source tree.
- No real-provider latency, cross-provider service behavior, additional Pi versions, Windows terminal behavior, or public registry publication is claimed.

## Rollback

1. `/model-roles pause` preserves this session's current pair. The global **Disable automatic routing** control preserves models without deleting roles.
2. To remove functionality entirely, disable/remove this package through Pi's package controls, then restart. An in-flight model switch should be allowed to finish first.
3. The package data directory remains for reinstall. Remove it separately only if you intentionally want to discard role configuration.
4. Pi's configured defaults/authentication were never changed, so no default-model migration or restoration is necessary. Session model/history entries remain normal Pi history.

Publication, registry identity, and an actual license selection remain separate owner actions. No commits, public releases, or dependency/package-manager migrations are needed to use the local tarball.
