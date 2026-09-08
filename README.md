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

3. After research settles, Auto Setup opens the review automatically. Review evidence, model/effort trade-offs, and before/after role settings. Use **Discuss/refine** to state your workload and priorities—for example, “Favor reliability for cross-file debugging; keep routine edits inexpensive.” Confirm the exact configuration diff to save it.

Auto Setup compares candidates with your existing roles and settings. It aims for a small, distinct role set and justified reasoning effort, not one role per model or maximum effort everywhere. Without stated priorities, its guidance favors a conservative balance of reliability, latency, and cost; recommendations are not measured guarantees. See [how recommendations are designed](docs/configuration.md#how-auto-setup-designs-recommendations).

Auto Setup uses the current Pi agent and any tools you already enabled; it does not switch your active model or apply changes without confirmation. With only the inherited `default` role, Pi makes no extra selection request. When custom roles exist, the default model classifies eligible new prompts: one clear match uses that role; no match or overlapping matches use `default`.

### Everyday commands

Run these inside Pi:

| Command | Use |
| --- | --- |
| `/model-roles settings` | Add, edit, delete, or review roles; Auto Setup is the first item. |
| `/model-roles use <role>` | Choose a role for the current session without classification. |
| `/model-roles disable` | Pin the current model and effort by pausing automatic selection. |
| `/model-roles enable` | Allow the next eligible prompt to be selected automatically. |
| `/model-roles run /command [arguments]` | Select a model, then invoke a registered command while idle; respects manual/disabled routing. |
| `/model-roles context [prompt\|conversation]` | Choose prompt-only or opt-in bounded conversation context. |
| `/model-roles why` | Explain the last selection without displaying private task/history text. |

Manual model or reasoning-effort changes also pause automatic selection. Your Pi defaults are never rewritten. Disable pauses this session even if saving fails; enable resumes only after the global toggle is saved successfully.

**Routing scope:** selection runs before a new idle TUI submission, including registered prompt templates such as `/plan <description>` and `/skill:name <task>`. It classifies the command and arguments as submitted, before expansion—not the template/skill body. Extension-owned commands (as opposed to prompt templates), tool-loop turns, and headless/child sessions are not automatically routed. See [supported contexts and limitations](docs/compatibility.md#where-automatic-routing-applies).

### Context-aware follow-ups

Prompt-only routing remains the default. To let selection interpret follow-ups such as “implement that” using recent retained dialogue and summaries, run:

```text
/model-roles context conversation
```

Review the privacy disclosure before confirming. A clear same-task continuation can retain the existing eligible role; changed scope is reclassified, and ambiguity still falls back. This is bounded conversation context, not a full-history or per-tool-turn router. Use `/model-roles context prompt` to opt out and `/model-roles why` to inspect the decision. See [context policy and limits](docs/configuration.md#selector-context).

### Commands that launch tasks

For extension-owned commands that skip automatic routing, use the explicit wrapper:

```text
/model-roles run /execute-plan docs/plan/feature.html
```

The target command must already be installed. The wrapper routes from its name and arguments, then invokes the original command unchanged—no changes to Pi or the command's package are needed. It selects the **parent session model**, not any subagent models. Run `/model-roles enable` first if selection is paused. See [command routing, privacy, and recovery](docs/compatibility.md#run-an-extension-owned-command).

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

Custom roles can add one selector request before an eligible idle TUI submission, including `/model-roles run`. By default it receives submitted task text and role descriptions only. Opt-in conversation mode also sends bounded recent dialogue and existing summaries to the default selector provider, which may differ from the execution provider. Raw thinking, tool calls/results, and images are excluded, but dialogue/summaries can still contain sensitive copied content or unmarked template expansions: this is not a secret detector. No extra summarizer or repository scan is added. The selected model receives Pi's normal task context. Auto Setup uses the current agent and any tools you have enabled. See [cost and privacy safeguards](docs/configuration.md#advanced-limits-and-safeguards).

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
