# Architecture and routing flow

[← README](../README.md) · [Configuration](configuration.md) · [Integration API](api.md) · [Compatibility](compatibility.md)

This guide explains how pi-model-roles makes model-selection decisions. It is for users who want to understand routing behavior and for contributors who need the system boundaries. For installation and everyday commands, start with the [README](../README.md).

## Design goals

The package separates selection policy from Pi integration and provider discovery:

- **Exact model identity:** a model is the exact `{ provider, id }` pair; IDs may contain slashes.
- **Local, conservative policy:** explicit choices, validity checks, and fallback order are deterministic.
- **Bounded semantic classification:** a model decides only whether a task clearly matches a configured role.
- **Safe progress:** unavailable roles and failed selection fall back when a usable configured, inherited, or current model remains.
- **No hidden provider setup:** model discovery, authentication, provider access, and task execution remain Pi responsibilities.

## Main components

```text
Pi input and lifecycle events
  -> RolesController
     -> cached Pi adapters and configuration snapshot
     -> pure selection policy
     -> optional independent-profile or default-model classifier
     -> apply selected model and effort through Pi

Settings and Auto Setup
  -> UI drafts and review
  -> ConfigStore validation and atomic YAML save
```

| Area | Responsibility |
| --- | --- |
| `src/config/` | Parse, validate, load, and atomically save the versioned role YAML file. |
| `src/core/` | Define exact model identities, role types, classifier protocol, precedence, and fallback decisions without Pi runtime mutation. |
| `src/pi/` | Adapt Pi's cached registry/defaults, coordinate session lifecycle, apply model and effort, and expose the process-local selection service. |
| `src/ui/` | Provide role settings, model pickers, selector loader, Auto Setup review, and confirmation flows. |
| `src/auto-setup/` | Validate research proposals, build prompts, guard the draft-only handoff tool, merge reviewed changes, and preserve safe draft state. |

`src/extension.ts` wires these areas into Pi's public extension events. `src/index.ts` exposes the standalone selection library; it does not register an extension, access the filesystem, or mutate a session when imported.

## Routing a new task

Automatic routing applies only to a new interactive prompt submitted while a primary TUI session is idle. This includes registered prompt templates such as `/plan <description>` and `/skill:name <task>`. It does not independently reroute tools, retries, steering, queued follow-ups, extension-generated messages, headless sessions, or known subagent children.

This is an explicit host boundary: Pi 0.85.1 snapshots model/effort before its `context` hook. The package does not switch models there or project full conversation history for classification. It selects at `input`, before the supported pre-prompt preparation/dispatch boundary, with submitted task text and optionally a bounded retained-conversation projection. See [per-turn compatibility](compatibility.md#per-turn-routing-is-not-supported).

```text
New eligible prompt
  -> Is there an explicit model/effort choice or a paused session?
     -> yes: preserve it
     -> no: resolve eligible roles from cached availability
  -> Are custom roles eligible?
     -> no: use default fallback without a classifier request
     -> yes: ask the independent selector or resolved default model for matching role IDs
  -> Conversation mode establishes unchanged task/role continuity?
     -> yes: retain the still-eligible current assignment
     -> no: evaluate role matches
  -> Exactly one valid match?
     -> yes: select that role
     -> no, invalid, ambiguous, failed, or timed out: use default fallback
  -> Revalidate and apply the selected model, then effort
  -> Let Pi prepare and execute the task normally
```

Slash-prefixed submissions are checked against Pi's current public `getCommands()` metadata. Only prompt-template and skill sources are eligible; extension-owned and unknown commands are not. Pi dispatches registered extension commands before `input`, so a command that shadows a template remains outside automatic routing. Existing command registrations and handlers are never replaced or re-registered. Metadata is read locally on each eligible slash submission, so resource reloads do not leave a stale allowlist.

In default prompt mode, the selector sees submitted task text (including raw command/arguments) and eligible role IDs/descriptions only. Opt-in conversation mode adds the bounded active-branch projection from `src/pi/routing-context.ts`: recent user/assistant text and existing summaries, with raw thinking, tool calls/results, image bytes, and arbitrary custom entries excluded. Recognized Pi skill envelopes are reduced to their invocation; unmarked past template expansions and sensitive text copied into dialogue/summaries may remain. There are no new file reads or summarizer requests. The public `buildContextEntries()` projection respects compaction and retained tails, not abandoned branches. Context-window budget checks can discard oldest optional history, never the submitted task. See [context policy](configuration.md#selector-context).

Pi expands the unchanged submission after routing; cancellation restores the original command. Later extension injections and provider serialization are not visible at this boundary. A strict contextual result either classifies role matches or requests continuation; the latter requires retained dialogue and an unchanged eligible prior role/model/effort matching the current pair. History cannot grant model, tool, or provider permissions. Its semantic interpretation remains model judgment, not a deterministic correctness guarantee.

The selected pair remains active for tools, retries, and queued follow-ups. The next eligible idle submission uses the independent profile (or default model when absent) as its selector; a clear same-task continuation in conversation mode may retain the prior execution pair. Otherwise the usual role-match/default fallback applies. Contextual results are discarded if branch/leaf or configuration revision changes during selection, and compaction invalidates pending selection. Receipts contain counts and reason codes, not copied conversation text.

## Explicit command routing

`/model-roles run /command [arguments]` is a separate, opt-in entry point for extension-owned commands. `src/pi/command-target.ts` validates an exact invokable name against public `getCommands()` metadata; built-ins, unknown names, and recursive model-roles calls are rejected. The controller shares its bounded selection/application flow with ordinary input rather than pretending generated messages are interactive input.

```text
Explicit run while idle
  -> Resolve registered target and snapshot public ownership metadata
  -> Select/apply from the raw target command and arguments (or preserve manual/disabled state)
  -> Recheck session generation, idle/queue state, and target ownership
  -> pi.sendUserMessage(target, { expandPromptTemplates: true })
  -> Original handler or normal template/skill expansion
```

No target file or generated prompt is read for selection. This wrapper stays prompt-only even when idle-input conversation mode is enabled. Target-generated messages retain `source=extension`, so they do not trigger a second selector. An intervening agent start invalidates pending selection, as do manual changes, reload/navigation, and shutdown. Cancellation restores the wrapper text without dispatch. Once handed off, the original command owns execution, model overrides, permissions, and any child launches. Public dispatch is fire-and-forget; the wrapper neither reports target completion nor retries or rolls back target effects. See [command boundaries](compatibility.md#run-an-extension-owned-command).

## Precedence and fallback

The pure selection policy follows this order:

1. An explicit caller or startup model/effort choice is preserved. Invalid explicit pins are returned as invalid rather than silently replaced.
2. A manually paused session preserves the current pair.
3. A directly requested role is resolved without classification.
4. Disabled routing or a default-only configuration uses default fallback without classification.
5. Otherwise, one bounded classifier request may select one clear eligible custom role.

For normal routing failures, fallback is finite and ordered: configured `default`, inherited Pi baseline, then current permitted usable model. Duplicate identities are skipped. No arbitrary provider or model is chosen, and the package never replays a task that has begun execution.

A manual model or effort change disables Auto Selector for the session. The package records safe decision metadata but does not persist submitted task text, role descriptions, raw classifier replies, or provider errors in its routing state.

## Configuration lifecycle

The durable state is a single YAML configuration file outside the installed package checkout. Settings creates the initial inherited `default` role only when the file is absent and the package runs in a primary interactive terminal session.

Configuration is validated before routing and before saving. The store serializes writes in-process, uses an exclusive lock and revision check, writes a private same-directory temporary file, then replaces the destination atomically. Invalid files are retained for repair; they are not reset or overwritten automatically. Saved but currently unavailable roles remain intact and are skipped during eligibility checks.

Toggle persistence uses a separate set-enabled transaction: acquire the same lock, read/validate the latest file, update only `enabled`, and atomically commit. Even a same-value request reads fresh state; a true no-op preserves existing bytes. Unrelated role edits survive, while role drafts and context-policy edits retain strict revision checks. Disable pins the local pair before persistence; failed enable remains paused. UI failures after a committed save cannot turn it into an uncommitted-save result.

See [configuration](configuration.md) for the schema, path, limits, inheritance rules, and recovery instructions.

## Auto Setup lifecycle

Auto Setup is a confirmation-first research and review workflow, not a background model benchmark or a provider-discovery service.

```text
Select cached candidate models
  -> disclose normal agent and tool data flow
  -> current Pi agent researches and submits a proposal-only draft
  -> agent settles
  -> review evidence, role recommendations, and exact config diff
  -> optionally discuss/refine
  -> explicitly confirm one revision-checked save
```

The package does not switch the active model or effort for research. It activates a draft-only proposal tool for the current request generation, validates one bounded submission, and removes that authority after acceptance, cancellation, model changes, navigation, reload, or shutdown. The tool cannot save configuration. A review opens only after the normal agent has settled; restored drafts are review-only.

The normal agent may use tools already configured in Pi. The package asks it not to modify files, but that instruction is not a sandbox. Source URLs and model mappings are agent-reported claims for the user to review. Auto Setup saves no role configuration until the user reviews the final diff and confirms it.

## Other hosts and subagents

Automatic routing is intentionally limited to the primary interactive Pi session. An SDK host or another extension can call the standalone library or use the versioned process-local event service to obtain a decision, then apply it through its own execution and permission policy. The package does not automatically intercept arbitrary subagent tools, external CLI runners, or remote processes.

The optional pi-subagents example selects before delegation and forwards the selected exact model and effort through the existing launcher. It is not part of ordinary installation. The automatic-background bridge experiment is withdrawn: its compatibility probe returns an unsupported diagnostic without any registration/RPC, and its child entry is inert. Child model-scope authority and a supported per-turn application boundary cannot be inferred from environment bindings. See the [integration API](api.md) for contracts and boundaries.

## Known boundary

Pi owns model switching, authentication, context preparation, compaction, attachment handling, and task execution. The package checks state before and after its own asynchronous work, but a Pi model switch already in progress cannot be made fully atomic with session changes or shutdown under the tested public Pi API. See the [model-switch limitation](compatibility.md#model-switch-limitation).

## Selector profile, privacy scope and evaluation

The optional selector profile is declarative configuration, resolved independently from execution role state. Core rejects unsupported explicit selector effort; Pi adapts only verified API-specific forwarding. No selector-provider retry or network discovery is added. Scoped Pi execution effort pins constrain the eligible effort list. Default-only and existing precedence bypasses are unchanged; no new equivalent-pair shortcut is installed because role continuation receipts require a separate equivalence proof.

`src/pi/context-policy.ts` owns a versioned process singleton keyed by agent directory and logical session UUID, not a host instance. It stores policy enums and revisions only, never writes files or Pi entries, survives module reload, refuses capacity overflow and preserves revision tombstones. Controller reads effective policy for every submission and checks its revision through application. Unrelated global/profile/Auto Setup saves never reset this explicit override. See [lifetime and sharing rules](configuration.md#logical-session-context-override-process-only).

`projectRoutingInput()` returns strict context plus separate non-content projection observations. Only context enters core; `/why` displays the observations separately from core budget trimming. The pressure advisory reads public host usage on demand and never invokes compaction. `src/evaluation/` is an explicitly invoked sequential paired selector harness with hard ceilings, not an agent runner, semantic benchmark result or execution-quality measurement. See [evidence status](selector-evaluation.md).
