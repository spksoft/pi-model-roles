# Configuration v1

## Location and lifecycle

One user-global YAML file: `join(getAgentDir(), 'extensions', 'pi-model-roles', 'config.yaml')`. The usual root is `~/.pi/agent`; `PI_CODING_AGENT_DIR` replaces it. There are no project role files, config overlays, environment-based role definitions, automatic migrations, or background watchers.

Only an absent file is automatically initialized, only in a primary TUI session. Cold invalid configuration leaves Pi's current model alone and keeps repair menus available. Invalid reloads retain the last-known-good immutable in-memory snapshot, show a warning, and leave the file intact. Changes from other sessions become visible on `/model-roles reload` or Pi `/reload`; successful menu saves take effect locally immediately.

## Schema and defaults

```yaml
version: 1
enabled: true
selectorTimeoutMs: 8000
roles:
  default:
    model: inherit
    effort: inherit
  fast:
    description: >-
      Use for short, well-specified mechanical tasks.
    model:
      provider: example-provider
      id: owner/example-model
    effort: low
```

The provider/model above are placeholders, not shipped defaults. Use the menu to choose real available models.

| Field | Required / default | Meaning |
| --- | --- | --- |
| `version` | Required; `1` | Unsupported versions are retained, not migrated. |
| `enabled` | Optional; `true` | Enables automatic selection. False preserves current model/effort; menus and explicit role use remain available. |
| `selectorTimeoutMs` | Optional; `8000` | Integer 1,000–60,000; bounds classifier authentication/setup and response. Not an execution timeout or a deadline for Pi's separate `setModel`. |
| `roles` | Required | 1–32 roles, including a required `default`. |
| role identifier | Required | `[a-z][a-z0-9_-]{0,47}`; unique. `constructor`, `prototype`, and `__proto__` are forbidden. |
| `default.model` | Required; fresh value `inherit` | `inherit` or exact `{provider, id}`. |
| `default.effort` | Required; fresh value `inherit` | `inherit` or an effort below. |
| custom `description` | Required | 1–2,000 Unicode characters after trimming; multiline/Unicode supported. Criteria only, never an execution prompt. |
| custom `model` | Required | Exact `{provider, id}`; inheritance is forbidden. |
| custom `effort` | Required | Explicit supported effort; inheritance is forbidden. |

Efforts: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`. Model capabilities determine which are available. The menu only offers supported levels. If saved configuration becomes unsupported, ordinary selection clamps like Pi (next supported higher level, otherwise lower) and reports `effort_clamped`. Explicit API effort pins are rejected if unsupported. No-reasoning models use `off`.

Provider and model ID strings are nonempty, whitespace-trimmed, at most 512 UTF-16 code units each, and exclude ASCII control characters. Model IDs may contain slashes; identity is the exact pair, not a fuzzy or bare-name match. No provider endpoints, authentication, tools, permissions, execution instructions, or selector-effort profile are configured here.

## Inheritance and eligibility

`inherit` stays symbolic in YAML. Resolve Pi's effective **trusted** configured provider/model; if unset/unknown, use the original startup pair. Effort resolves per-model Pi default → global Pi default → original startup effort. Automatic switches never redefine that baseline. Reload re-resolves defaults using read-only `SettingsManager` access and never saves/migrates Pi's settings.

A package override of `default` changes only this package's selector/default execution role. Missing/unauthenticated/out-of-scope models remain visible with warnings but are not candidates. The menu rechecks availability before save; unavailable external YAML assignments are retained for recovery, not treated as a reason to corrupt the file. An empty Pi scope means normal unscoped operation; an explicit empty API allowlist means no models. Image metadata from retained context/attachments prevents switching to text-only workers. The selector never receives image content.

Manual/external and explicit caller choices outrank automatic defaults. The fallback sequence never invents an arbitrary provider or retries an already-started task. If no permitted option remains, the caller/Pi owns its normal error handling.

## Bounds and classifier protocol

- YAML: **256 KiB**, including serialized output. Reject unknown fields, duplicate keys, explicit tags, aliases, merge expansion, unsupported versions, and malformed field types. Errors contain safe field paths/line-column positions, not source snippets.
- Task text: **16,384 Unicode characters**; blank/image-only tasks use default. Oversized tasks bypass classification rather than being silently truncated.
- Classifier input: sorted eligible custom IDs/descriptions plus submitted task as JSON data. No tools, conversation history, images, or task expansion.
- Conservative context budget: UTF-8 bytes of the classifier system/data payload + 2,048 output tokens + 1,024 overhead must fit the selector context window.
- Output: at most **2,048 tokens** requested and **16,384 UTF-8 bytes** accepted; exact JSON `{"matches":["fast"]}` only. Extra keys, duplicate/unknown IDs, code fences, malformed output, tool content, or incomplete/error responses fall back.
- One clear match selects it; zero/multiple matches use default. One request at most, no retries. Usage/duration describe the selector, not worker execution.

## Saves, conflicts, and repair

Menu editing is a draft until all steps and confirmations finish. The first custom-role save confirms selector cost/data flow. Escape/cancel at any step leaves model and file unchanged. Menu saves canonicalize YAML: **comments and formatting are not preserved**. Default is first; custom IDs sort lexically.

Writes use a per-store queue, an exclusive `config.yaml.lock` directory (2-second wait), revision comparison, private same-directory temporary file, file sync, and atomic rename. Directory sync is best effort where unsupported. New directories/files request `0700`/`0600` permissions. Nonregular final paths and final-file symlinks are rejected. Parent directories remain a trusted local filesystem boundary, not a hostile-user sandbox.

- **Conflict/busy:** reload, then reapply your draft; never force overwrite.
- **Abandoned lock:** verify no Pi process is writing this configuration before manually removing only `config.yaml.lock`. No automatic lock stealing occurs.
- **Invalid YAML:** correct the file or use the confirmed **Reset configuration** action. Reset replaces only this package's file; custom roles are lost. Nonregular/oversized files may require manual repair first.
- **Unavailable model:** configure its provider in Pi, choose another role model, or return default to `inherit`; reload the relevant Pi registry through Pi's normal controls.
- **Rollback:** disable automatic routing or pause this session. Removing/disabling the extension and restarting leaves YAML available for reinstall and never changes Pi's saved defaults.
