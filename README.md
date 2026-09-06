# pi-model-roles

Small, explicit model roles for [Pi](https://github.com/earendil-works/pi). Start with **one `default` role**, inheriting Pi's model and thinking effort. Add your own roles using native dialogs; no presets, agent personas, or new subagent runner.

## Install locally

Requires Node.js **>=22.19.0**. Tested with `@earendil-works/pi-coding-agent` **0.85.1**; other versions are not yet verified. The optional example targets `pi-subagents` **0.65.1**.

```sh
npm ci --ignore-scripts
npm run check
npm pack --ignore-scripts
pi install ./pi-model-roles-0.1.0.tgz
```

Restart Pi or use its `/reload`. Public npm publication and a license are owner decisions; this repository currently uses `UNLICENSED`. The tarball includes prebuilt JavaScript/declarations and has no install/postinstall build. For development, after `npm run build`, load `dist/extension.js` with Pi's `-e` option.

## Use

Run **`/model-roles`** immediately after activation. No onboarding wizard or configured provider is required to open it.

- **Add role:** identifier → description of when to use it → model → explicit supported effort → review/save.
- **Edit default:** override its model/effort or restore `inherit`; default cannot be deleted or renamed.
- **Use a role:** select a model/effort now and pause automatic routing.
- **Pause / resume / disable / reload / reset:** native menu controls, with destructive confirmations.

Commands: `/model-roles [settings|status|reload|pause|auto|use <role>]`.

A fresh primary TUI session creates:

```yaml
version: 1
enabled: true
selectorTimeoutMs: 8000
roles:
  default:
    model: inherit
    effort: inherit
```

Data lives at `getAgentDir()/extensions/pi-model-roles/config.yaml`, usually `~/.pi/agent/extensions/pi-model-roles/config.yaml`. `PI_CODING_AGENT_DIR` is respected. This is outside the installed package; Pi's `settings.json`, authentication, and other packages are never rewritten.

## Routing and authority

With only default (or no eligible custom roles), there is **no classifier call**. With custom roles, each new **idle interactive prompt** makes at most one selector request to the resolved **default model**, not the previously selected worker. Exactly one clear custom-role match selects it. No match, ambiguity, invalid output, timeout, or failure uses a finite fallback: configured default → inherited Pi baseline → current permitted usable model.

Selection happens in Pi's `input` hook before model/authentication checks and pre-prompt compaction. The selected model stays active through tools, retries, and queued continuations. Slash expansions, steering, extension wake messages, print/JSON/RPC hosts, and known subagent children are not independently routed.

Manual model/effort changes pause automation until `/model-roles auto`. Explicit startup and API caller choices remain authoritative; an invalid explicit API pin is reported, not silently substituted. Reload preserves session authority and never turns the previous worker into the default selector.

**Escape in the selector loader cancels the submission**, restores its text, and does not run the task. Images may need reattachment. See [compatibility](docs/compatibility.md) for the host's in-flight model-switch limitation.

## Cost, privacy, and limitations

Saving the first custom role discloses an additional request's cost, latency, and data flow:

- The **default selector provider** receives submitted task text and role descriptions only, without history, tools, file content, or image bytes.
- The **selected execution provider** receives Pi's normal conversation and attachments. Switching providers can therefore expose existing conversation context to another configured provider.
- Descriptions are selection criteria, **never execution/system instructions**.
- No routing log, prompt cache, telemetry, raw provider errors, or duplicated task/description data is persisted. Pi itself continues to save its ordinary session history. Selector usage is reported separately from execution usage.
- Local precedence/fallback is deterministic; the model's semantic judgment is not guaranteed reproducible.
- No provider discovery/probing occurs on the routing path. Availability and effort come from Pi's cached registry; Pi and callers retain policy authority.

## Integrate and develop

`selectModelForTask(request, dependencies)` returns a decision only: it does not mutate sessions or launch work. Independently installed extensions can use the session-targeted `pi-model-roles:select:v1` event. Headless/SDK hosts must opt in through the API.

- [Configuration, limits, and recovery](docs/configuration.md)
- [Library/event API and integration examples](docs/api.md)
- [Compatibility, validation, and rollback](docs/compatibility.md)
- [Release notes](CHANGELOG.md)
- [Manual TUI checklist](test/manual/tui-checklist.md)

`npm run check` runs formatting, lint, strict types, unit tests, build, and SDK/package integration tests. Tests use synthetic fake providers, disposable agent directories, and no credentials/live provider access. The packed smoke test uses npm's offline cache populated by `npm ci`. `npm run format` formats maintained source/configuration; no implementation changes are made to Pi or pi-subagents.
