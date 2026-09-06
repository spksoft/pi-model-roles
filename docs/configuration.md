# Configure model roles

[← README](../README.md) · [Compatibility and troubleshooting](compatibility.md) · [Integration API](api.md)

For most users, **`/model-roles` is the only configuration tool needed**. Use its dialogs to add roles, choose models and thinking effort, and control automatic routing. You do not need to write YAML or look up provider IDs by hand.

## Manage roles in Pi

| Goal | Steps in `/model-roles` |
| --- | --- |
| Add a role | **Add role** → identifier → when-to-use description → model → effort → review and save. |
| Change a role | Select the role → **Edit**. Review all fields before saving. |
| Change the default | Select `default` → **Edit**. Choose a model and effort, or restore **Inherit Pi default** and `inherit`. |
| Choose a role yourself | Select the role → **Use for this session**, or run `/model-roles use <role>`. This pauses automation. |
| Remove a custom role | Select the role → **Delete** → confirm. This does not change the active execution model. |
| Stop automation temporarily | **Pause routing**, or `/model-roles pause`. Resume with `/model-roles auto`. |
| Stop automation across sessions | **Disable automatic routing**. This saves `enabled: false`; existing sessions must reload to see it. |
| Start over | **Reset configuration** → confirm. This removes custom roles and restores the inherited default configuration. |

The default role cannot be deleted or renamed. Menu edits remain drafts until confirmed, and cancelling leaves the model and file unchanged. Saving a role does not immediately switch the execution model; **Use for this session** does.

## Auto Setup

Auto Setup is a primary-TUI workflow for researching **one to eight** cached available models and proposing ordinary role changes. It has no YAML settings and does not configure providers, credentials, search services, or Pi's tool permissions.

1. Run `/model-roles auto-setup` or select **Auto Setup** in the menu, then choose models with Space and continue with Enter.
2. Read and confirm the disclosure. Research uses the **current Pi model** without switching it. The model receives its normal Pi conversation/provider flow and may use the tools you already configured. Tool providers can make requests, charge, or retain data under their own policies. Auto Setup does not sandbox them.
3. The normal agent should research first-party material for every exact selected provider/model ID and submit a structured report. It may instead report that no official evidence was found, that it used offline knowledge, or that a serving-model identity could not be resolved. A source URL is agent-reported and user-reviewable, not independently verified by this package. Offline knowledge means no web evidence was collected; it is not a local model run.
4. When Pi reports the proposal settled, run `/model-roles auto-setup review`. Inspect per-model evidence state, dates, benchmark conditions/caveats, recommendations and the exact role diff. **Discuss/refine** sends a new guarded normal-agent message. Ordinary chat is not captured as Auto Setup discussion.
5. Choose whether to keep conflicts, replace individual conflicting roles, or replace all custom roles after a destructive confirmation. Confirm the final diff. Research and discussion alone never write `config.yaml`.

Auto Setup preserves `enabled`, `selectorTimeoutMs`, untouched roles, the session's routing mode, and the current model/effort. An unchanged unavailable role does not prevent an otherwise valid proposed addition; a model/effort newly added or changed must still be cached as available and supported at save time. A suggested default replacement is separate and never implicit. Adding the first custom role also shows the normal future-selector cost/provider disclosure; research consent does not grant that permission.

The proposal is bounded to eight models, three source records per model (24 total), 31 custom suggestions, 2,048-character URLs, 1,500-character assessments, 1,000-character role rationales, 500-character effort rationales/caveats, 64 KiB tool/session payloads, and 32 KiB generated prompts. Inputs beyond these bounds are rejected, never silently truncated. The package stores only bounded report/draft state in Pi custom session entries, not live request tokens, credentials, raw fetched pages, or deliberately copied conversation text. Bounded generated report text can still contain unwanted material; do not treat this as a secret-detection guarantee.

`/model-roles auto-setup cancel` revokes pending proposal authority before waiting for Pi to become idle. It aborts only a research turn it can identify as its own; otherwise press Escape to stop the ordinary agent. It cannot reverse completed requests, charges, or tool effects. A valid restored proposal is review-only. A malformed, unknown-version, cancelled, or applied latest Auto Setup session marker is non-actionable and never revives an older draft. If configuration changes after research, reload/check it and review a new exact diff before saving. If configuration saves but its session applied marker cannot be recorded, the role file is already saved; the package reports a warning and does not retry.

Pausing is session-specific; disabling is a saved global setting. `/model-roles auto` clears the session pause but does not override `enabled: false`. Enable global routing in the menu as well if needed. Neither action sends a selector request immediately.

## Write useful role descriptions

A description tells the selector **when the role applies**, not how to perform the task.

- Prefer a narrow criterion: “Use for small documentation corrections with no code changes.”
- Avoid broad overlaps such as “Use for coding” and “Use for programming.” Multiple matches use `default`, not the first role in the list.
- Put execution instructions such as “Run the tests before finishing” in your prompt or `AGENTS.md`, not in a role description.
- Choose models already available in Pi. The package does not configure providers, authenticate accounts, or measure which model is best.

The first custom-role save asks you to confirm the extra request's cost and data flow. Manually adding custom roles to YAML enables the same behavior without that dialog; read [cost and privacy](../README.md#cost-and-privacy) first.

## Where settings live

There is one user-wide file:

```text
~/.pi/agent/extensions/pi-model-roles/config.yaml
```

The exact path is `join(getAgentDir(), 'extensions', 'pi-model-roles', 'config.yaml')`. If you set `PI_CODING_AGENT_DIR`, it replaces `~/.pi/agent`. The menu and `/model-roles status` show the resolved path.

- Roles are shared across projects, even when the package is installed with Pi's `-l` option.
- There are no project role overrides, environment-based role definitions, or background file watchers.
- The file lives outside the GitHub checkout and survives package updates/removal. Back it up if you want to preserve a particular configuration.
- Role changes never update Pi's saved model defaults, authentication, or other packages' settings.

Only a missing file is automatically created, and only in a primary interactive terminal session. The package never replaces an existing invalid file automatically.

## Edit YAML manually

Edit the file at the path above, then run `/model-roles reload`. Pi's `/reload` also reloads it. Successful menu saves take effect in that session immediately; other open sessions need a reload.

This is the initial configuration:

```yaml
version: 1
enabled: true
selectorTimeoutMs: 8000
roles:
  default:
    model: inherit
    effort: inherit
```

A custom role adds a description, an exact provider/model pair, and an explicit effort:

```yaml
version: 1
enabled: true
selectorTimeoutMs: 8000
roles:
  default:
    model: inherit
    effort: inherit
  quick:
    description: >-
      Use for small, well-specified edits that do not require design decisions.
    model:
      provider: example-provider
      id: owner/example-model
    effort: low
```

**The provider and model above are placeholders**, not working defaults. Choose real models through the menu, and use only efforts those models support.

Menu saves normalize YAML: **comments and formatting are not preserved**. The default role is written first and custom roles are sorted by identifier. That order is for readability, not selection priority.

### Configuration reference (version 1)

| Field | Requirement / default | What it controls |
| --- | --- | --- |
| `version` | Required; `1` | Configuration format. Other versions are rejected without migration or overwriting. |
| `enabled` | Optional; `true` | Automatic routing. `false` keeps the current model/effort; menus and explicit role use remain available. |
| `selectorTimeoutMs` | Optional; `8000` | Selector deadline in milliseconds, including its authentication/setup. Integer from 1,000 to 60,000. Does not limit task execution or Pi's separate model-switch operation. |
| `roles` | Required | Between 1 and 32 roles, including `default`. |
| Role identifier | Required | Unique lowercase ID matching `[a-z][a-z0-9_-]{0,47}`. `constructor`, `prototype`, and `__proto__` are forbidden. |
| `default.model` | Required; initially `inherit` | Pi's inherited model, or an exact `{provider, id}` override for this package. |
| `default.effort` | Required; initially `inherit` | Pi's inherited thinking effort, or an explicit effort. |
| Custom `description` | Required | When to use the role: 1–2,000 Unicode characters after trimming. Multiline and non-English text are supported. |
| Custom `model` | Required | Exact `{provider, id}`. Custom roles cannot use `inherit`. |
| Custom `effort` | Required | An explicit supported effort. Custom roles cannot use `inherit`. |

Effort values are `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, and `max`. Availability depends on the model; the menu shows only supported levels. Models without reasoning use `off`.

If a saved effort is no longer supported, normal role selection uses Pi's clamping rule: choose the next supported higher level, otherwise a lower level. Status reports `effort_clamped` and the requested/effective values. Explicit API effort pins are rejected rather than silently clamped.

Provider and model IDs are separate, exact identifiers. Each must be nonempty, whitespace-trimmed, at most 512 UTF-16 code units, and contain no ASCII control characters. Model IDs may contain slashes. There is no fuzzy name matching.

This file does **not** configure provider endpoints, credentials, tools, permissions, execution instructions, or a separate selector-effort profile. Unknown fields are rejected.

## How inheritance and availability work

`inherit` means Pi's trusted configured defaults, **not whichever model ran your last task**:

1. Resolve Pi's effective configured provider/model; if unset or unknown to Pi's registry, use the original startup pair.
2. Resolve effort from Pi's per-model default, then its global default, then the original startup effort.
3. Re-read inherited defaults on reload without saving or migrating Pi's settings.

Overriding `default` changes this package's selector and default execution role only. Manual session changes and explicit caller choices take precedence over automatic routing.

Unavailable, unauthenticated, or out-of-scope models remain in your YAML and appear with warnings. They are not eligible candidates; the menu checks availability again before saving a chosen model. Image attachments or images retained in conversation context prevent selection of text-only execution models. The selector itself receives no image bytes.

Normal fallback is **configured default → inherited Pi baseline → current permitted, usable model**, skipping duplicate model identities. If no option is usable, Pi or the API caller handles the error. Explicit invalid API model pins are not silently replaced. An empty Pi scope means normal unscoped operation; an explicit empty API allowlist means no models are permitted.

## Recover from a problem

| Problem | What to do |
| --- | --- |
| Automatic selection is not running | Check `/model-roles status`. Clear a session pause with `/model-roles auto`, and enable global routing in the menu if disabled. Default-only configuration intentionally makes no selector request. |
| A model is marked unavailable | Configure/authenticate its provider in Pi, choose another role model, or restore default inheritance. Refresh model availability using Pi's normal controls. Role reload alone does not probe providers. |
| YAML is invalid | Correct the reported field/location, then reload. Or back up the file and use **Reset configuration** to discard custom roles. |
| An external edit does not appear | Run `/model-roles reload` in each affected session. There is no file watcher. |
| A save reports a conflict or busy file | Reload and reapply the draft. Do not force an overwrite. Another session may have saved first. |
| `config.yaml.lock` remains after a crash | First verify that no Pi process is writing this configuration. Only then remove that lock directory. Locks are never automatically stolen. |
| Reset or save still fails | Check file permissions and path type. Symlinks, nonregular files, and oversized files may require manual repair before the menu can save. |

On a failed reload, the session retains its last valid in-memory configuration and shows a warning; the invalid file is left intact. If the first load is invalid, Pi keeps its current model and the repair menu remains available.

Reset replaces only this package's YAML, after confirmation. To stop using the package without losing roles, pause/disable it or follow the [removal instructions](../README.md#update-or-remove).

## Advanced limits and safeguards

These limits protect configuration and selection; they do not truncate or rewrite the task Pi will execute.

| Limit | Behavior |
| --- | --- |
| YAML size: 256 KiB, including serialized output | Oversized files/saves are rejected. Duplicate keys, explicit tags, aliases, merge expansion, malformed types, and unknown fields are also rejected. Errors use safe field paths or line/column positions, not source snippets. |
| Task text: 16,384 Unicode characters | Larger tasks skip classification and use fallback. Blank/image-only tasks also use default. |
| Selector context budget | UTF-8 bytes of its system/data payload, plus 2,048 output tokens and 1,024 overhead, must fit the selector context window. Otherwise classification is skipped. |
| Selector output: 2,048 tokens requested; 16,384 UTF-8 bytes accepted | Output must be exact JSON such as `{"matches":["quick"]}`. Extra keys, duplicate/unknown IDs, code fences, tool output, malformed or incomplete/error responses fall back. |

Only sorted eligible role IDs/descriptions and submitted task text are sent as selector data. One clear match selects a role; zero or multiple matches use default. There is at most one request and no retry.

Saves use a per-store queue, an exclusive lock with a 2-second wait, revision checks, a private temporary file, file sync, and atomic rename. Directory sync is best effort. New directories/files request `0700`/`0600` permissions where supported. Final-file symlinks and nonregular paths are rejected; parent directories are assumed to be trusted local storage, not a security sandbox.
