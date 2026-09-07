# Integrate model selection

[← README](../README.md) · [Architecture](architecture.md) · [Configuration](configuration.md) · [Compatibility](compatibility.md)

This is the detailed API guide for extension and SDK authors. For the routing design before integrating it, see [Architecture and routing flow](architecture.md). **Regular Pi users only need `/model-roles`.** Installing this package does not automatically route other packages' subagents or headless tasks.

The API answers one question: **which model and thinking effort should handle this task?** It returns a decision. Your integration still applies the model, prepares context, checks permissions, and runs the task through its existing execution path.

Auto Setup is intentionally **not** a public research/search API. It is a primary-TUI workflow inside this package that uses the current normal Pi agent and the user's configured tools, stores a review draft, and requires an explicit YAML confirmation. It does not expose cross-extension web-tool execution, provider credentials, benchmark data, or a new selection API contract.

## Choose an integration

| Your host | Use | Who supplies configuration? |
| --- | --- | --- |
| A Node/SDK application with a package dependency | `selectModelForTask(request, dependencies)` | Your application, with its own model and classifier adapters. |
| An independently installed Pi extension in the same process | `pi-model-roles:select:v1` on `pi.events` | The matching primary interactive session's model-roles service. |
| A headless host that wants to offer an event service | `registerSelectionService(...)` | Your host, explicitly. No automatic service is registered. |
| A separate process or external CLI runner | Build your own explicit integration | Events here are process-local, not a remote protocol. |

Resolve your host's explicit model/effort settings and permitted-model restrictions **before requesting selection**. Pass pins as `explicitModel`/`explicitEffort` and restrictions as `allowedModels`, which bounds both selector and execution. A run or agent configuration must not be silently overridden just because it was omitted from the API request. If you cannot establish these restrictions through your host's public contracts, keep its launcher unchanged rather than guessing.

## Library quickstart

The package is ESM and exports TypeScript declarations. A Pi GitHub installation does not automatically make it a Node dependency of another project. For a standalone consumer, build and pack the repository as described under [contributor validation](compatibility.md#contributor-validation), then install that tarball as a dependency:

```sh
npm install /path/to/pi-model-roles-0.1.0.tgz
```

A minimal, provider-free example:

```ts
import { defaultConfig, selectModelForTask } from "pi-model-roles";

const model = { provider: "example-provider", id: "owner/example-model" };
const current = { model, effort: "off" as const };

const decision = await selectModelForTask(
  { task: "A synthetic task", current, baseline: current },
  {
    config: defaultConfig(),
    models: () => [
      { ref: model, efforts: ["off"], images: false, contextWindow: 32000 },
    ],
    classify: async () => {
      throw new Error("Default-only selection does not call the classifier");
    },
  },
);

if (decision.status === "selected" || decision.status === "preserved") {
  // Apply decision.model and decision.effort through your host's own policy.
} else {
  // Handle unavailable/cancelled. Do not launch from a missing model.
}
```

The model above is a placeholder in a synthetic registry; this example sends no provider request. A real integration supplies eligible models and a classifier adapter when it enables custom roles.

Importing the package performs no filesystem access, extension registration, credential discovery, or session mutation. The core does not load/save YAML or construct a launcher. `yaml` is the only non-Pi runtime dependency; Pi integration packages are peers.

## Request reference

### `SelectionRequest`

| Field | Requirement / behavior |
| --- | --- |
| `task: string` | Required. Submitted task text; bounded for classification and never persisted by this package. |
| `current: {model?, effort}` | Required. Caller's current state; effort is always required. |
| `baseline: {model?, effort}` | Required. Stable inherited default, not the last selected execution model. The primary TUI event service supplies its own baseline. |
| `explicitModel?: {provider, id}` | Resolved caller model pin. Preserve it or return `invalid_explicit`; never silently substitute another model. |
| `explicitEffort?: Effort` | Resolved effort pin. An effort-only pin retains the current model. Unsupported explicit effort is rejected. |
| `requestedRole?: string` | Select a role directly without classification. An unavailable role follows normal fallback; inspect the returned role and `fallback` if exact role use is mandatory. |
| `paused?: boolean` | Default `false`. Preserve the current pair without classification. |
| `allowedModels?: readonly ModelRef[]` | Absent: adapter eligibility only. `[]`: no models allowed. Restricts both selector and execution models; at most 10,000 exact references. |
| `requiresImages?: boolean` | Default `false`. Execution model must support images. Inspect retained context/attachments locally; do not forward image bytes to the selector. |
| `signal?: AbortSignal` | Cancel selection. Does not automatically cancel subsequent task execution. |

Model identity is the exact `{provider, id}` pair. IDs may contain slashes. Effort values are `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, and `max`, subject to model support.

Precedence is **explicit model/effort → paused → requested role → disabled configuration → default-only → classifier**. Invalid explicit pins are not replaced with defaults. When an explicitly pinned model has no explicit effort, inherited/current effort may be clamped to its capabilities; requested and effective effort are returned separately.

### `SelectionDependencies`

| Dependency | What your adapter must provide |
| --- | --- |
| `config: RoleConfig` | Version-1 configuration. A validated copy is used per call; see the [configuration reference](configuration.md#configuration-reference-version-1). |
| `models(): readonly AvailableModel[]` | A synchronous, cached eligible registry. Entries contain `ref`, supported `efforts`, `images`, and `contextWindow`. Selection reads it again before returning a final result. Do not perform network discovery here. |
| `classify(input): Promise<{text, usage?}>` | A standalone selection request using the exact supplied model. Input includes `systemPrompt`, bounded JSON `text`, `signal`, and `maxTokens`. Forward cancellation; do not add execution tools/history or log raw errors. |
| `defaultEffort?(model): Effort` | Per-model inherited effort. If omitted, baseline effort is used. |
| `now?(): number` | Numeric clock for durations; defaults to `Date.now`. |

The classifier must return strict JSON such as `{"matches":["quick"]}`. See [protocol limits](configuration.md#advanced-limits-and-safeguards). Timeout settles selection even if an adapter ignores cancellation; late results are ignored, but adapters should cooperate to stop their own work.

Your adapter owns authentication, availability, scope, and trusted finite capability values. The API grants no permissions. Requests are independent; do not concurrently mutate caller-owned objects or adapters while a request is outstanding.

## Handle the decision

| `status` | What to do |
| --- | --- |
| `selected` | Apply the returned model/effort after your host's final checks. |
| `preserved` | Respect the caller's retained choice; do not reinterpret it as permission to reroute. |
| `unavailable` | Handle the error or repair the request/configuration. There is no executable model in the result. |
| `cancelled` | Stop this selection attempt. There is no executable model in the result. |

Every result has `reason`, `fallback`, and safe `warnings`. Successful results also have an exact `model`, effective `effort`, `requestedEffort`, and optional `role`.

Optional `selector` metadata contains its model, nonnegative `durationMs`, and numeric `usage: {input, output, totalTokens, cost}` when the adapter supplies it. This measures selection, not task execution, and may not appear in Pi's normal execution totals.

Use `status` and `fallback` to decide what to do; use `reason` to explain the path. Normal fallback is **configured default → inherited baseline → current**, deduplicated by exact identity. No arbitrary model is chosen, and no task is replayed.

### Reason and warning codes

The package exports all reason codes as `REASONS`:

| Reasons | Meaning |
| --- | --- |
| `explicit`, `manual`, `disabled` | Preserve a local choice without classification. |
| `requested_role`, `default_only`, `matched` | Direct role/default selection or one valid semantic match. |
| `no_match`, `ambiguous`, `invalid_response` | Use default fallback after evaluating the classifier response. |
| `selector_failed`, `selector_timeout`, `selector_unavailable` | Selector transport, deadline, or availability problem. |
| `input_too_large`, `insufficient_text`, `context_budget` | Skip classification and use default fallback. |
| `role_unavailable`, `no_usable_model` | Requested role is unusable, or no permitted fallback remains. |
| `invalid_explicit`, `invalid_request`, `config_invalid` | Caller/configuration contract needs repair. Invalid explicit pins are not silently substituted. |
| `cancelled`, `stale`, `apply_failed` | Cancellation or interactive application lifecycle outcome. Pure library calls never apply a model. |

Warnings are `effort_clamped`, `roles_unavailable`, and `default_unavailable`. Decisions contain no task text, role description, raw exception, classifier response, image content, prompt hash, or free-form model justification. Do not add those to your integration's logs.

The ESM root exports `selectModelForTask`, `defaultConfig`, `EFFORTS`, `REASONS`, the versioned event helpers, and their TypeScript contracts. The internal menu/store are not public APIs.

## Select through Pi events

Use the event contract when packages are installed independently and cannot import each other. The active primary TUI session owns **`pi-model-roles:select:v1`**:

```ts
// Inside a Pi extension with access to pi and ctx.
// SelectionDecision is the type described above.
const event = {
  version: 1 as const,
  sessionId: ctx.sessionManager.getSessionId(),
  request: { task, current, baseline: current, signal },
  result: undefined as Promise<SelectionDecision> | undefined,
};

pi.events.emit("pi-model-roles:select:v1", event);
const decision = await event.result;
if (!decision) {
  // No matching service. Report it; do not silently launch by another path.
}
```

If your integration imports the library, `selectViaEvents(bus, sessionId, request)` wraps this contract and converts an absent listener to `unavailable/selector_unavailable`. The [selection client example](../examples/selection-client.ts) shows how to turn a successful library decision into launcher model/thinking fields.

Important boundaries:

- The matching owner validates the request and assigns the result Promise **synchronously**. Wrong session IDs are ignored; a populated result prevents duplicate owners from starting another request.
- The owner uses its own configuration and baseline but **does not switch the parent model**. Parent manual pause is not automatically inherited by independent child requests; callers supply the child's explicit choices and pause state.
- Reload replaces the owner. Disposal cancels outstanding service results and removes its listener. Headless and known-child ambient instances register no automatic owner.
- `registerSelectionService(bus, sessionId, handler)` lets an opt-in host offer the same service and returns a disposer. The handler must be bounded/cooperative to clean up its own resources.
- This is advisory and process-local, not a security boundary. Promises and signals cannot be serialized into a remote request.

## Automatic-child compatibility diagnostic

`createPiSubagentsBackgroundBridge(pi: Pick<ExtensionAPI, "events">)` returns `Promise<PiSubagentRoutingDiagnostic>`. It is a fail-closed compatibility probe, **not a launcher**. On the tested Pi 0.85.1 / pi-subagents 0.65.1 contracts it always returns:

```ts
{
  status: "unsupported",
  code: "automatic_child_routing_unsupported",
  message: "..." // bounded explanation and explicit-selection remediation
}
```

There is no `spawn()` or `dispose()` method. No registration, subscription, timer, RPC, provider call, or launch is performed. `piSubagentRoutingDiagnostic(request?)` returns the same result synchronously; optional `{model?: ModelRef, effort?: Effort}` pins are neither inspected, echoed, nor modified. `PI_SUBAGENT_ROUTING_UNSUPPORTED` exports the code. The diagnostic is static, not discovery of an installed owner. See the [host limitation](compatibility.md#per-turn-routing-is-not-supported).

The experimental binding parser, active child entry, and complete-context `SelectionRequest.context` option are not supported public APIs. The source child-entry file is intentionally inert for stale configurations; bindings cannot authorize routing. Primary non-TUI/child sessions remain inactive even when role YAML exists.

## Optional pi-subagents example

[examples/pi-subagents.ts](../examples/pi-subagents.ts) demonstrates **select first, then delegate through the existing launcher**. It is not loaded by normal installation, and pi-subagents is not required for interactive model roles.

To try it with compatible **pi-subagents 0.65.1** installed and enabled alongside this package, start Pi with the example explicitly loaded (default user-wide GitHub installation, POSIX shell):

```sh
pi -e "${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/git/github.com/spksoft/pi-model-roles/examples/pi-subagents.ts"
```

Then run `/model-roles-delegate-example <task>` inside Pi. This launches real work through your configured providers; use a non-sensitive test task and expect normal selection/execution costs.

The example registers a uniquely named, model-unpinned native demo agent through the public runtime-registration event. It forwards:

- The exact `provider + '/' + completeModelId` and a separate `thinking` value, preserving slashes inside the ID.
- Fresh context through the existing correlated `prompt-template:subagent:request` contract, with native preflight and permission policy unchanged.
- No role descriptions in execution prompts and no requested artifacts.
- A 25-second native timeout and a 30-second result/cancel boundary, with no alternative runner or retry after denial/failure.

Response identity is correlated by request/owner/node; cancellation uses pi-subagents' protocol. Registrations are disposed on shutdown. Missing/incompatible owners are reported rather than replaced. The exported `delegateExample` also accepts explicit `{model, effort}` pins; production callers must resolve their own agent/run defaults first.

Automated tests cover native fake-provider child execution, exact IDs and effort forwarding, explicit pins, and parent isolation. Foreground children need providers loaded in their own runtime; they do not inherit all parent extensions. Known `PI_SUBAGENT_CHILD` copies of this package remain inactive. This example does not establish compatibility with arbitrary external CLI runners or uninstrumented subagent tools.
