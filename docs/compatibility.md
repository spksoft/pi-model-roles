# Compatibility and troubleshooting

[← README](../README.md) · [Architecture](architecture.md) · [Configuration](configuration.md) · [Integration API](api.md)

This is the detailed support and troubleshooting guide. Use this page to check whether your Pi setup is covered, diagnose unexpected routing, and understand known limits. Start with the [GitHub installation instructions](../README.md#quick-install) if the package is not installed yet.

## Requirements and tested versions

| Component | Requirement or tested boundary |
| --- | --- |
| Node.js | **22.19.0 or newer**. CI is configured for 22.19.0; local validation has used 22.21.1 on macOS. |
| Pi | **0.85.1**, using `@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`, and `@earendil-works/pi-tui`. Other versions are not yet verified. |
| Provider access | Configure providers/authentication in Pi. There are no bundled models or separate credentials for this package. |
| GitHub installation | Git and npm are required. Pi loads the extension directly from the repository's TypeScript source, so no manual build is required. |
| Package format | ESM with compiled JavaScript and declarations. Locally built npm tarballs include `dist/` and need no install/postinstall build. |
| Optional subagent example | **pi-subagents 0.65.1**. Not required for normal use. |

Pi peer dependency ranges are `*` to follow Pi's packaging guidance; **that is not a claim that every Pi version works**. No additional Pi versions, Windows terminal behavior, or live-provider performance is claimed. The package is currently `UNLICENSED`, and no public npm release is assumed.

GitHub install/update/remove syntax follows [Pi's package documentation](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md).

## Where automatic routing applies

| Context | Behavior |
| --- | --- |
| Primary interactive terminal session, new prompt while idle | Automatic selection when the footer shows `auto-selector=enabled`. |
| Tools, retries, steering, or already-queued follow-ups | Keep the active model; no independent selection. |
| Registered prompt templates (for example `/plan <description>`) and `/skill:name <task>`, submitted interactively while idle | Select once from raw command/arguments before Pi expands them, plus bounded retained dialogue if conversation mode is enabled. The current expansion is not read for selection. |
| Extension-owned commands, unknown slash commands, or extension-generated messages | No independent automatic routing. Pi dispatches registered extension commands before the input hook. Use the explicit `run` wrapper for registered commands. |
| `/model-roles run /command [arguments]`, primary TUI while idle | Explicit pre-command selection using the same roles and manual/disabled state, followed by normal command dispatch. |
| Print, JSON, RPC, or headless/SDK hosts | No automatic routing or configuration creation. Integrate through the API explicitly. |
| Known pi-subagents children | Ambient copies of this extension stay inactive; the launcher selects before launch. |
| Other subagent tools or external CLI runners | No universal interception or automatic model translation. Require an explicit integration. |

The package uses Pi's cached model availability and capabilities. It does not probe providers on each task, change authentication, or bypass model scope and launcher permissions. Structurally valid roles can remain saved even when their models are temporarily unavailable.

## Run an extension-owned command

Use the wrapper when a command launches work through extension-generated messages, as `/execute-plan` does:

```text
/model-roles run /execute-plan docs/plan/feature.html
```

The command must already be installed and invokable in this session. pi-model-roles does not provide `/execute-plan`, modify its package, or replace its handler. Running `/execute-plan` directly still skips model selection. This wrapper uses only Pi 0.85.1's public command discovery, model selection, and message-dispatch APIs.

- **Eligible targets:** registered extension commands, prompt templates, and skills. Use the exact invokable name, including a numeric suffix such as `/review:2` if Pi assigned one. Separate the name and arguments with a space; arguments, quoting, and subsequent newlines are forwarded unchanged. Built-in commands, unknown names, and `/model-roles` itself (including numeric aliases) are rejected before selection. It is a command wrapper, not a shell runner.
- **When it runs:** primary TUI only, while idle with no queued messages or pending selection. Busy submissions are refused immediately, not queued or delayed. Manual/disabled routing preserves the current pair and gives a notice; enable Auto Selector separately if classification is wanted. Default-only configuration still makes no classifier request.
- **Data and cost:** at most one prompt-only selector request from the raw target command and arguments, even when conversation mode is enabled, subject to the normal limits and fallback rules. The wrapper does not read referenced files, command descriptions, generated kickoff prompts, or plan contents for classification. A filename may be insufficient to distinguish task roles; use `/model-roles use <role>` for an exact choice. Arguments are not secret-filtered. The wrapper is text-only and does not forward new image attachments; existing conversation image-capability checks still apply.
- **Cancellation and changes:** Escape during selection restores `/model-roles run ...` without invoking the target. Manual changes, reload/navigation, shutdown, or an intervening agent start invalidate pending selection. Before dispatch the wrapper checks session/idle state and public command ownership metadata again. If ownership changed, no target is dispatched, but a model may already have been selected; check the footer before retrying. An already-started Pi model switch retains the [usual limitation](#model-switch-limitation).
- **After dispatch:** the selected pair remains active; it is not a temporary override. Pi's public `sendUserMessage` API is fire-and-forget. Target preparation, permissions, validation, explicit model overrides, completion, and failures remain the original command's responsibility. The wrapper does not report command success, automatically retry, revert the model, or undo target effects. Wait for the target's own preparation/work to finish before starting another command or changing model/session. Check Pi's diagnostics and any effects before retrying an error.
- **Parent only:** a command can explicitly change the parent model afterward or launch children with their own model settings. The wrapper does not translate or override subagent/runner model choices. Auto Setup and other generated messages remain excluded from independent routing.

These semantics are tested with synthetic command owners through the real Pi SDK, including generated kickoff messages and actual dispatch model/effort. They do not establish full end-to-end acceptance of a separately installed planning package or live providers.

## Per-turn routing is not supported

On tested **Pi 0.85.1**, the `context` event runs after the agent loop captures the request's model and thinking effort, and before Pi converts its internal messages to provider messages. Calling `pi.setModel()` there changes session state but not that request's captured pair. A selector can appear to work in the footer while execution uses the previous pair.

The experimental per-turn context hook and full-history projector remain withdrawn. Routing stays at the supported idle primary-TUI `input` boundary, before model/authentication checks and pre-prompt compaction. A separate opt-in conversation mode now projects bounded retained dialogue through public session APIs at that same input boundary; it is explicitly incomplete, not full final-provider-context routing. Registered prompt-template and skill submissions route once from raw command text plus that optional history; expansion itself does not trigger another selection. Tool loops, queued work, extension-owned commands, Auto Setup, non-TUI modes, and children are not independently rerouted. No dependency is patched.

Automatic child routing also lacks a public way to carry pi-subagents' resolved model-scope authority into this extension. `createPiSubagentsBackgroundBridge(pi)` always returns `unsupported/automatic_child_routing_unsupported`; it does not register an agent, subscribe, start a timer, or emit RPC/spawn requests—even with a compatible owner. The withdrawn child entry stays inert regardless of environment bindings. This avoids changing extension-loading policy, escaping model restrictions, or abandoning a late-accepted launch. Use [explicit selection before an existing launcher](api.md#optional-pi-subagents-example), providing resolved pins and permitted models before selection; the launcher retains final authority.

The per-turn plan under `docs/plan/` is a historical proposal whose host assumptions did not hold, not a supported feature. If you ran the experiment, reload the package, check/reselect the intended model and effort, and explicitly enable routing only when wanted; no role YAML migration is required.

## Auto Setup boundary

Auto Setup uses Pi **0.85.1** public normal-agent, `agent_settled`, dynamic-tool, custom-entry, and primary-TUI APIs. It is not available in print, JSON, RPC, headless, or known subagent sessions. It selects up to eight cached available models and asks the current Pi model to research them without switching model or effort.

The current agent may use configured web/search tools, but pi-model-roles does not invoke another extension's tool directly, bundle a search provider, add credentials, or change tool permissions. The package can restrict its own proposal handoff to a draft-only tool; it **cannot make arbitrary normal-agent tools read-only**. Research instructions request no file/configuration changes, but users must understand their active tool permissions before confirming. Agent-reported citations and provider/upstream mappings remain reviewable claims, not independently verified facts; guessed aliases are not accepted for role assignments.

A report is ready only after Pi's normal agent run settles, including retries or queued work. Review opens automatically on a deferred idle callback so the `agent_settled` event itself is not blocked by a modal. If the session becomes busy first, the draft remains at the top of Settings. Provider/tool cancellation is cooperative and cannot undo completed effects or charges; use Escape to stop active research. Restored drafts are review-only and malformed/latest cancelled/applied history is deliberately non-actionable.

## Troubleshooting

Start with the footer's `auto-selector=enabled|disabled` indicator and `/model-roles why`, then open `/model-roles settings` to inspect roles and warnings. A fallback is an expected recovery path, not necessarily an error.

| Symptom | Check or action |
| --- | --- |
| `/model-roles` is missing after GitHub installation | Restart Pi or run `/reload`, then use a primary interactive session. Check `pi list` and `pi config` if the package is missing or disabled. |
| Extension fails to load after an update | Restart Pi or run `/reload`. If it remains unavailable, run `pi update git:github.com/spksoft/pi-model-roles`, then check `pi list` and `pi config`. |
| Role model picker still shows the whole catalog after updating | Run `pi update git:github.com/spksoft/pi-model-roles` in your shell, then restart Pi or run `/reload` and reopen `/model-roles settings`. All model pickers show at most eight rows with type-to-search. Check `pi list`/`pi config` for a duplicate older copy if it persists. |
| No extra request runs | This is normal with only `default`, no eligible custom roles, bypassed input, or `auto-selector=disabled`. |
| `/plan <description>` or `/skill:name <task>` does not select | Update this package and reload Pi; older versions skipped every slash-prefixed input. Check `auto-selector=enabled` and that eligible custom roles exist. Registered templates and skills now route before expansion; an extension that owns the same command name bypasses Pi's input hook. Use `/model-roles run /command [arguments]` for those commands, or choose `/model-roles use <role>` first (then disable Auto Selector if the pair must stay pinned). |
| `/execute-plan` starts without selecting | Invoke `/model-roles run /execute-plan ...` while idle with Auto Selector enabled. The bare command still follows its original, unrouted path. The target must be installed separately. |
| `run` says the target or session changed | The target was not dispatched. Let any model switch/work finish, check the active pair and exact command name, then resubmit. After any dispatch error, inspect Pi's diagnostics and target effects first; the wrapper never retries automatically. |
| Routing stopped after you changed models | Manual model/thinking changes disable automation for the session. Run `/model-roles enable` to resume on the next eligible prompt. |
| A manually used role changed on the next prompt | `/model-roles use <role>` preserves Auto Selector state. Run `/model-roles disable` after choosing the role when it must stay pinned. |
| A task used default instead of a custom role | Inspect `/model-roles why` for `no_match`, `ambiguous`, unavailable-role warnings, or selector failure. Make descriptions distinct. For follow-ups such as “implement that”, consider opt-in `/model-roles context conversation`; incomplete history still falls back. |
| Enable/disable cannot save | The warning now names the error category and distinguishes local pause from global persistence. Disable remains locally effective after failure; failed enable leaves routing paused. Fix the reported cause before retrying. |
| A save says it committed but UI refresh failed | Reload and inspect saved state; do not blindly retry the write. |
| History inclusion is unwanted | Run `/model-roles context-session prompt` for this logical session/process without saving, or `/model-roles context prompt` for the global default and reload other sessions. Explicit session overrides may mask global changes. Already transmitted requests cannot be undone. |
| Selection is slow or times out | Custom roles add one request to the independent selector profile or default model. Adjust `selectorTimeoutMs` within its documented bounds if appropriate. Disabling Auto Selector or removing custom roles avoids that extra request. |
| Saved roles do not appear in another session | Run Pi's `/reload` there. Configuration has no background watcher. |
| Role model or effort is unavailable | Configure the provider in Pi or edit the role. The menu shows supported effort levels; older saved values may be clamped with a warning. |
| Escape restored text but not an image | Selection was cancelled and the task was not run. Reattach the image before submitting again. |
| YAML cannot be loaded or saved | Follow [configuration recovery](configuration.md#recover-from-a-problem). Do not force an overwrite or delete a lock while another process may be writing. |
| Auto Setup report never becomes reviewable | The active agent may have produced only prose or exhausted its instructed correction attempt. Wait until it settles, then start again or use manual role editing. |
| Auto Setup rejects `invalid_caveats` | The report requires a `caveats` string array, not a scalar. Updated research/refinement prompts and the typed tool schema explain this, and validation errors allow one instructed correction attempt. After a package update, restart Pi or run `/reload` and start a fresh Auto Setup; old research messages retain the old contract. |
| Auto Setup cites no web sources | The current model may lack usable search tools, have found no official source, or have used explicitly labelled offline knowledge. Treat all agent-reported citations as reviewable claims. |
| Auto Setup says the config changed | Another session or manual YAML edit changed the revision. Keep the evidence, then start/review again against the current config; do not force an overwrite. |
| Auto Setup cancellation did not stop visible work | Normal-agent cancellation is cooperative and cannot undo finished tool/provider work; use Escape when appropriate. |

Task text beyond 16,384 Unicode characters, blank/image-only input, or an insufficient selector context budget skips classification and uses fallback. See [all limits](configuration.md#advanced-limits-and-safeguards).

## Model-switch limitation

**Wait for a model switch to finish before changing sessions or shutting down.** If you interrupt a switch, check the active model and effort afterward and reselect your intended pair if necessary.

The package cancels pending selection when you change models, reload, navigate, or shut down. It discards stale selector results and checks again before applying model and effort. However, **a Pi model switch that has already started may briefly complete after cancellation**.

In Pi 0.85.1, `pi.setModel()` does not accept cancellation or a conditional “apply only if this session/state is still current” argument. Model/effort notifications also lack a unique operation ID. The package can guard its own selection and effort application, but cannot make concurrent session replacement, shutdown, or repeated manual changes fully atomic with that public API.

`selectorTimeoutMs` only bounds selection, not Pi's separate model application or task execution. No private Pi patch or alternate runner is used to hide this limitation.

## Other extension and host boundaries

- Another extension earlier in Pi's input chain may consume a prompt before model roles sees it. A later extension may consume or transform it after selection. There is no universal input priority/ownership guarantee across unrelated extensions.
- Selection runs before Pi's normal model/authentication checks and pre-prompt compaction. Pi still owns conversation conversion, compaction, attachments, and execution.
- SDK startup model-choice provenance is not universally exposed. Unknown headless hosts stay inactive; direct API callers must supply their own explicit model/effort pins.
- The event service is process-local and advisory, not an authorization boundary or distributed routing service. See the [API guide](api.md).

## Disable, remove, or return to default

1. Run `/model-roles disable` to keep the current selected role, model, and effort. The footer must show `auto-selector=disabled`.
2. To return to default-only routing, delete custom roles individually in Settings. For a full reset, back up and edit/remove the YAML manually, then run Pi's `/reload`.
3. To remove the extension, let any switch finish, then run this in your shell and restart Pi:

   ```sh
   pi remove git:github.com/spksoft/pi-model-roles
   ```

Removal keeps the role YAML for reinstall. Delete the data separately only if you intentionally want to discard it. Pi's saved model defaults/authentication were not changed by role configuration, so there is no default-model migration to undo. Session model/history entries remain ordinary Pi history.

## Contributor validation

This section is for development, not routine installation. Work in a separate clone rather than Pi's managed package checkout, which updates can reset and clean:

```sh
git clone https://github.com/spksoft/pi-model-roles.git
cd pi-model-roles
npm ci --ignore-scripts
npm run check
```

`npm run check` runs:

| Command | Purpose |
| --- | --- |
| `npm run format:check` | Check formatting of maintained source/configuration. |
| `npm run lint` | Run Biome lint. |
| `npm run typecheck` | Check strict TypeScript, including public-contract fixtures. |
| `npm test` | Run unit tests, including YAML examples in README/configuration and API reason-code documentation. |
| `npm run build` | Generate `dist/` JavaScript and declarations. |
| `npm run test:integration` | Run SDK, storage, UI-flow, event, native subagent, and packed-package tests. |

Use `npm run format` to apply the repository formatter. Before builds, use LSP diagnostics when available; before finishing, check session diagnostics with `lens_diagnostics(mode=all)`. An unavailable diagnostics provider is not a successful type check; script output remains authoritative. Update related user docs for every user-visible change, as required by [AGENTS.md](https://github.com/spksoft/pi-model-roles/blob/main/AGENTS.md).

After building, load a development extension for one run with `pi -e ./dist/extension.js`. Avoid simultaneously enabling an installed copy when checking a development copy. To produce a prebuilt tarball for a standalone API consumer or packaging inspection:

```sh
npm pack --ignore-scripts
```

For version 0.1.0 this produces `pi-model-roles-0.1.0.tgz`. It includes compiled code, declarations, examples, and the maintained user guides, with no install/postinstall build. Normal users should follow the [GitHub installation guide](../README.md#quick-install).

### Native subagent verification context

Run the native test (and the full `npm run check` gate that includes it) in a normal parent environment, not inside a delegated child:

```sh
node --import tsx --test test/integration/pi-subagents.test.ts
```

In **pi-subagents 0.65.1**, the package entry captures `PI_SUBAGENT_CHILD === "1"` at import time and makes its parent extension a no-op in that context. No runtime-agent registration or structured-delegation event owner is installed. The SDK fixture's later parent/child simulation cannot undo that import-time decision. A request without an owner previously reached the example's 30-second `unavailable_or_timed_out` boundary; this was not evidence of a slow native child or a failed model invocation. The native test now fails immediately with a parent-context diagnostic before importing the optional package or changing fixture environment variables. It remains a failing test in the wrong context, not a skip or an accepted unsupported result.

Do not unset child/depth flags, move imports to evade the guard, increase timeouts, or substitute another launcher. Ask the normal parent to run the same command with its environment unchanged. This check only identifies the known import-time constraint; it does not grant launch authority or bypass any depth, permission, or provider checks. Completion, exact model/effort, explicit pins, and parent-isolation assertions remain mandatory.

The installed package's `docs/extension-api.md` specifies synchronous runtime registration after extension setup, no result when no compatible owner handles the request, and an active context for structured delegation. The opt-in example already warns if registration is unavailable; its command will not launch without a registration. Direct API callers must likewise use a ready owner in a supported context. No supported-parent runtime defect or need for an upstream patch was established by the child-only timeout.

### What automated checks cover

Tests use synthetic data, fake providers, and disposable agent directories—not credentials or live provider access. Dependency installation may need the network. The packed smoke test uses npm's offline cache populated by `npm ci`; a missing cache requires dependency provisioning.

Coverage includes:

- Configuration schema, bounds, safe errors, atomic storage, write failures, and cross-process save conflicts.
- Model/effort precedence, exact IDs, allowlists, image capabilities, strict classifier output, fallback, timeout, cancellation, and privacy sentinels.
- Default inheritance and trust-aware reads without rewriting Pi settings.
- Real Pi SDK lifecycle ordering, manual choices, reload/navigation, delayed model application, queued follow-ups, and headless/child bypass.
- Registered prompt-template/skill routing before expansion, raw multiline/quoted arguments, actual dispatch model/effort, selector privacy, cancellation, fallback, removed templates, and extension-command ownership. Synthetic templates reproduce the `/plan` entry path; this is not an end-to-end test of a separate planning package.
- Explicit route-and-run delegation through Pi's public command dispatch, argument preservation, single-selection generated kickoff, manual/disabled behavior, busy/unknown/recursive rejection, ownership changes, selection/model-application cancellation, and no automatic dispatch retries.
- Smaller-context model selection before Pi compaction using a fake transport; this does not establish live-provider compaction behavior.
- Native dialog draft cancellation, role management, explicit role use, resume, reset, and session-targeted event isolation/disposal.
- Real component keyboard input through SDK role creation/edit/default flows with a large three-provider fake catalog; shared picker pagination, fuzzy queries, exact refs, inherited default, multi-selection persistence, terminal-size render bounds, and focus forwarding.
- Native foreground pi-subagents model/effort forwarding and parent isolation, with an isolated `PI_SUBAGENTS_TEMP_ROOT` and no alternative launcher fallback. Automatic-background compatibility checks assert rejection with no registration/RPC; they do not claim background child execution.
- Actual dispatch model/effort and successful assistant responses across alternating selections, Auto Setup with existing custom/overridden-default roles, and task-only selector privacy after real skill expansion and file tool results. The SDK harness rethrows faux-provider callback assertion failures outside the provider so they cannot silently pass.
- Prebuilt tarball contents, production-only offline installation, plain-Node library/extension loading without development tooling, and YAML retention after package removal.

The packaging smoke test validates a **locally built tarball**, not a live GitHub fetch or a public registry release. Test results do not prove real-provider latency, cross-provider service behavior, or support for untested Pi versions.

### Manual checks still needed

**Human visual terminal acceptance is not yet claimed.** Automated dialogs/loaders test state and cancellation but do not prove keyboard/IME behavior, physical resizing, narrow terminals, or all themes.

Use the [manual TUI checklist](https://github.com/spksoft/pi-model-roles/blob/main/test/manual/tui-checklist.md) and record the actual environment and results. Do not describe the in-flight model-switch limitation as solved by those checks. The original files under `docs/plan/` are historical design records, not current installation or compatibility guidance.

## Selector upgrade boundaries

Independent selector model selection uses the cached registry and exact scope. Explicit selector effort forwarding is verified only through Pi 0.85.1's OpenAI Responses API-specific completion options (including off and model thinking maps); other APIs require effort omission on unpinned selectors. Scoped thinking pins require matching explicit, verified selector effort. The identifiable configured-provider `streamSimple` override path refuses explicit effort because it can discard/overwrite API-specific options; its unpinned model-only profiles remain supported. Unsupported explicit effort is a safe execution-fallback diagnostic, not permission to choose a new provider. Real fake-transport tests establish serialization/auth/signal behavior, not live provider compliance, prices or quality. Custom implementations can still depart from the public API semantics.

Session privacy overrides are shared by logical UUID + agent directory in one process, **not isolated per SDK host**. Real SDK tests cover reload, tree, session replacement/revisit and new/fork inheritance; other processes/restarts use global policy. Their runtime-only lifetime and capacity refusal are described in [configuration](configuration.md#logical-session-context-override-process-only). No compaction, final-payload inspection, background child routing, mid-task routing, or atomic cancellation of in-flight Pi `setModel` has been added.

`npm run evaluate:demo` is a credential-free harness/contract check. Live semantic advantage, end-to-end execution quality/cost and human TUI acceptance remain **unmeasured/not run**; see the [remediation and future-evidence checklist](selector-evaluation.md).
