# pi-model-roles

Give Pi a small set of task-based model roles so it can select the right configured model and reasoning effort for a new prompt. You define the boundaries; Pi keeps your explicit model choices in control.

## Quick install

Requirements: Pi, Node.js 22.19+, npm, Git, and provider access already configured in Pi.

```sh
pi install git:github.com/spksoft/pi-model-roles
```

Restart Pi or run `/reload`.

## Quick use

1. In Pi, open settings:

   ```text
   /model-roles settings
   ```

2. Choose **Auto Setup**, the first Settings item. Select one to eight available models to consider, then confirm the research disclosure.

3. After research settles, Auto Setup opens the review automatically. Review the proposed evidence and role changes, ask **Discuss/refine** if needed, then confirm the exact configuration diff to save it.

Auto Setup uses the current Pi agent and any tools you already enabled; it does not switch your active model or apply changes without confirmation. With only the inherited `default` role, Pi makes no extra selection request. When custom roles exist, the default model classifies eligible new prompts: one clear match uses that role; no match or overlapping matches use `default`.

### Everyday commands

Run these inside Pi:

| Command | Use |
| --- | --- |
| `/model-roles settings` | Add, edit, delete, or review roles; Auto Setup is the first item. |
| `/model-roles use <role>` | Choose a role for the current session without classification. |
| `/model-roles disable` | Pin the current model and effort by pausing automatic selection. |
| `/model-roles enable` | Allow the next eligible prompt to be selected automatically. |

Manual model or reasoning-effort changes also pause automatic selection. Your Pi defaults are never rewritten.

## Manual role setup

You can also add roles yourself in `/model-roles settings`. Add a custom role only for a clearly different task type, then choose its model and a supported reasoning effort. A useful description says when the role applies, for example:

```text
Use when the task is a localized, low-risk edit with an explicit outcome and no design decision.
```

Keep role descriptions distinct. If multiple roles match, Pi uses `default` instead of depending on role order.

## Default configuration

The initial file keeps Pi's existing defaults:

```yaml
version: 1
enabled: true
selectorTimeoutMs: 8000
roles:
  default:
    model: inherit
    effort: inherit
```

Use Settings instead of editing YAML unless you need the detailed options in the [configuration guide](docs/configuration.md).

## Cost and privacy

Custom roles add one selector request before eligible tasks. The selector receives your submitted task text and role descriptions; the selected model receives Pi's normal task context. Auto Setup uses the current agent and any tools you have enabled. See the detailed [cost and privacy guidance](docs/configuration.md#auto-setup).

## Detailed guides

- [Configuration and role design](docs/configuration.md) — settings, YAML, Auto Setup, limits, and recovery.
- [Architecture and routing flow](docs/architecture.md) — how selection, persistence, Pi lifecycle integration, and Auto Setup fit together.
- [Integration API](docs/api.md) — use selection from another extension or SDK host.
- [Compatibility and troubleshooting](docs/compatibility.md) — requirements, supported contexts, known limits, and contributor checks.
- [Manual terminal checklist](test/manual/tui-checklist.md) — maintainer-only visual acceptance checks.
- [Changelog](CHANGELOG.md) — user-visible changes.

## Update or remove

Run these in your shell, then restart Pi or run `/reload`:

```sh
pi update git:github.com/spksoft/pi-model-roles
pi remove git:github.com/spksoft/pi-model-roles
```

Removal keeps your role YAML so you can reinstall later. The package is currently `UNLICENSED`; no public npm release is assumed.
