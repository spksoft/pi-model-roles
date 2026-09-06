# pi-model-roles

Choose a model for each kind of task without switching models by hand. **pi-model-roles** adds user-defined model roles to [Pi](https://github.com/earendil-works/pi): you describe when a role should be used, choose its model and thinking effort, and Pi uses that role when a new task clearly matches.

Start with one **`default`** role that inherits your Pi defaults. Add custom roles only when you need them. Roles select a model and effort; they do not add personas, system instructions, tools, or a new subagent runner.

## Install from GitHub

You need **Pi**, **Node.js 22.19.0 or newer**, **npm**, and **Git**. The tested Pi version is **0.85.1**; see [compatibility](docs/compatibility.md) before using other versions. Configure your providers in Pi as usual—this package does not supply models or credentials.

1. Install the repository with Pi:

   ```sh
   pi install git:github.com/spksoft/pi-model-roles
   ```

2. Start or restart Pi, or run `/reload` in an open session. Then enter:

   ```text
   /model-roles
   ```

No npm registry release or optional subagent package is required. Review third-party extension code before installing: Pi extensions run with your system access.

## Get started

### Keep your usual default

On first use in an interactive terminal session, the package creates a single `default` role. Its model and thinking effort inherit Pi's configured defaults, falling back to the session's original startup values. **With only `default`, there is no extra model-selection request.** Opening the menu does not require a configured provider, but running tasks does.

You can select `default` → **Edit** to choose a different model or effort for this package. Choose **Inherit Pi default** and `inherit` to restore inheritance. The default role cannot be deleted or renamed, and editing it does not change Pi's saved defaults.

### Add a role

1. Open `/model-roles` and choose **Add role**.
2. Enter a short identifier, such as `quick`.
3. Describe **when to use it**, for example: “Use for small, well-specified edits that do not require design decisions.”
4. Choose an available model, then an explicitly supported thinking effort. Effort controls the model's reasoning level; models without reasoning use `off`.
5. Review and confirm the save. The first custom-role save also explains the extra request, cost, and provider data flow.

Possible role descriptions—not built-in presets:

| Role | When to use it |
| --- | --- |
| `quick` | Small, well-specified edits with no design decisions. |
| `design` | Architecture planning with competing requirements and trade-offs. |

Choose models you already use in Pi. Keep descriptions distinct: overlapping matches fall back to `default`. Descriptions are **selection criteria, not instructions to the executing model**. Keep actual coding or writing instructions in your prompt or `AGENTS.md`.

Cancel any editing step with Escape to leave the draft unsaved. To edit, use, or delete a saved role, select it in the menu.

## How it works

For a new prompt submitted while Pi is idle and automatic routing is enabled:

```text
Your new task
  → Check available roles and models
  → If custom roles are eligible, ask the default model which clearly match
  → One clear match: use that role; otherwise: use default
  → Pi runs the task with the chosen model and effort
```

The **selector** is the extra request that chooses a role. The **execution model** is the model that does your task.

- **The selector always uses the resolved default model**, not the model chosen for the previous task. If no custom role is eligible, selection skips the extra request.
- **At most one selector request runs per eligible prompt**, with no retry and an 8-second default timeout. A failed, invalid, ambiguous, or timed-out response falls back safely.
- **Fallback order is fixed:** configured `default` → inherited Pi baseline → current permitted, usable model. If none is usable, Pi or the API caller handles the error. The package never picks an arbitrary provider or replays an already-started task.
- **Selection happens before Pi prepares and runs the task**, including its model checks and context compaction. The chosen model stays active through tools, retries, and queued follow-ups. The next new idle prompt can choose another role.
- **Manual choices win.** Changing the model or thinking effort yourself pauses automatic routing. Explicit startup choices are preserved. Use `/model-roles auto` when you want automation again.

The fallback rules are deterministic; the model's judgment about a description can vary. This is not a model benchmark or a guarantee of the cheapest or best result.

Automatic routing applies to new idle interactive prompts only. Slash-command expansions, steering, extension-generated messages, print/JSON/RPC sessions, and known subagent children are not independently routed. Headless hosts and subagent launchers need an explicit [API integration](docs/api.md).

## Everyday controls

Run these commands **inside Pi**, not in your shell:

| Command | What it does |
| --- | --- |
| `/model-roles` or `/model-roles settings` | Open role management and routing controls. |
| `/model-roles status` | Show session mode, configuration path, and the latest decision, including fallback reason and selector usage when available. |
| `/model-roles use quick` | Apply the named role now without classification, then pause automatic routing. Replace `quick` with your role ID. Check status if the role's model is unavailable. |
| `/model-roles pause` | Keep the current model and effort for this session. |
| `/model-roles auto` | Clear the session pause; route the next eligible prompt if global routing is enabled. Does not send a request immediately. |
| `/model-roles auto-setup` | Select up to eight available models and begin a separately confirmed research-and-recommendation pass. |
| `/model-roles auto-setup review` | Review the latest settled Auto Setup proposal, discuss/refine it, or explicitly apply/cancel it. |
| `/model-roles auto-setup cancel` | Immediately revoke a pending Auto Setup proposal. If its normal agent turn is still running, Pi cancellation remains cooperative. |
| `/model-roles reload` | Reload saved roles and inherited defaults without clearing the session pause. |

The menu also offers **Disable automatic routing** (saved globally), **Enable automatic routing**, and **Reset configuration**. Disabling keeps your roles and current model; reset deletes custom roles after confirmation. Other open sessions see saved changes after reload.

**Escape during the selector loader cancels the submitted task**, restores its text, and prevents execution. Images may need reattachment. If a model switch is already underway, wait for it to finish before changing sessions; see the [model-switch limitation](docs/compatibility.md#model-switch-limitation).

## Auto Setup

**Auto Setup is optional and confirmation-first.** In a primary TUI session, choose **Auto Setup** from `/model-roles` or run `/model-roles auto-setup`, select one to eight currently available models, then confirm that the **currently active Pi model** may perform a normal agent research turn. Auto Setup never switches that model or its thinking level.

The active agent may use whichever tools you have configured. It should search first-party provider material for each exact selected model and submit a report with agent-reported source URLs, dates, benchmark conditions, caveats, and role recommendations. The handoff tool exposes a typed, bounded proposal schema, and research/refinement prompts explain the required field shapes. Unknown fields are rejected. If validation fails, the agent is instructed to correct the report and retry once rather than abandon it because of a single-call restriction. Source URLs are **not independently verified** by this package; a report can mix first-party citations, no-official-evidence-found, offline knowledge, and unresolved model identity. Offline knowledge means no web evidence was collected—it is not a local/offline model run and still uses your active model provider's normal data flow.

The package does not bundle a search service, credentials, or a tool sandbox. The research instruction asks the normal agent not to modify files, but other configured tools retain their normal permissions. After the agent settles, run `/model-roles auto-setup review` to inspect the report, ask a guarded **Discuss/refine** question, start over, cancel, or review an exact configuration diff. Ordinary chat is not Auto Setup discussion. Nothing in research or discussion writes role YAML.

On confirmation, Auto Setup asks whether to keep conflicting roles, replace selected conflicts, or replace all custom roles after a separate destructive warning. It preserves `enabled`, `selectorTimeoutMs`, untouched roles (including temporarily unavailable ones), your current model/effort, and your session's pause state. If it adds your first custom role, you separately confirm the future selector request's cost/privacy disclosure. A changed or invalid configuration must be reviewed again; a restored session draft is review-only until you take a fresh action.

Use **Cancel** to revoke Auto Setup's proposal authority immediately. The package aborts only a turn it can identify as its own; otherwise use Pi's Escape control to stop the normal agent. Cancellation cannot undo already completed provider/tool requests or their charges. Detailed limits, recovery, privacy, and evidence semantics are in [configuration](docs/configuration.md#auto-setup).

## Settings

Roles are stored outside the installed package, usually at:

```text
~/.pi/agent/extensions/pi-model-roles/config.yaml
```

With `PI_CODING_AGENT_DIR`, the path is `$PI_CODING_AGENT_DIR/extensions/pi-model-roles/config.yaml`. It is one user-wide file, even for a project-local package installation. Updates and removal leave it available for reuse.

The initial configuration is:

```yaml
version: 1
enabled: true
selectorTimeoutMs: 8000
roles:
  default:
    model: inherit
    effort: inherit
```

Use the menu for normal changes. For manual YAML edits, limits, and recovery, see [configuration](docs/configuration.md). Role edits never rewrite Pi's saved model defaults or authentication; Pi itself records package installation in its settings as usual.

## Cost and privacy

Adding custom roles enables an extra request before eligible tasks, adding **latency and possible provider charges**. Before enabling it, understand the two data flows:

| Recipient | Data it receives |
| --- | --- |
| Default selector provider | Submitted task text and eligible role descriptions. No separately loaded files, conversation history, tools, or image bytes. Text pasted into your task is still task text. |
| Selected execution provider | Pi's normal conversation, instructions, and attachments. Changing providers can send existing conversation context to another configured provider. |
| Auto Setup active model and its configured tools | Only after its own start confirmation: the normal agent research/discussion message, normal conversation/provider flow, and any tool-specific requests. Tool providers may charge or retain data under their own policies. The package saves bounded proposal/report metadata in normal Pi session history, not credentials or raw fetched pages. |

Role descriptions are saved in your YAML configuration. The package saves safe decision metadata in Pi's session entries, but does not duplicate task text or descriptions there. It creates no routing log, prompt cache, or telemetry; Pi continues to save its ordinary session history. Selector usage is separate from execution usage and may not appear in Pi's usual totals.

## Update or remove

Update the GitHub installation from your shell:

```sh
pi update git:github.com/spksoft/pi-model-roles
```

Restart Pi or run `/reload` after each update. Pi loads the extension directly from the package's TypeScript source, so no manual build is required. Do not keep personal edits or configuration in Pi's managed checkout.

To remove the package:

```sh
pi remove git:github.com/spksoft/pi-model-roles
```

Let any model switch finish, then restart Pi. Your role YAML remains; Pi's saved model defaults do not need restoring. You can also pause routing or disable the extension through `pi config` without uninstalling it.

## More documentation

- [Configuration](docs/configuration.md) — role design, YAML reference, and recovery.
- [Compatibility and troubleshooting](docs/compatibility.md) — supported modes, known limits, and contributor checks.
- [Integration API](docs/api.md) — selection without session changes, events, and an optional pi-subagents example.
- [Changelog](CHANGELOG.md) — user-visible changes.

For development, see [contributor validation](docs/compatibility.md#contributor-validation). The package is currently marked `UNLICENSED`; an open-source license and public npm release have not been selected.
