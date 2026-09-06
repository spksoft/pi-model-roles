# Selection API v1

The ESM package root exports `selectModelForTask`, `defaultConfig`, `EFFORTS`, `REASONS`, the versioned event helpers, and their TypeScript contracts. Importing it performs no filesystem access, extension registration, credential discovery, or session mutation. Pi packages are peers for extension integration; `yaml` is the only non-Pi runtime dependency.

## Library

```ts
import { defaultConfig, selectModelForTask } from "pi-model-roles";

const model = { provider: "example-provider", id: "owner/example-model" };
const current = { model, effort: "off" as const };
const decision = await selectModelForTask(
  { task: "A synthetic task", current, baseline: current },
  {
    config: defaultConfig(),
    models: () => [{ ref: model, efforts: ["off"], images: false, contextWindow: 32000 }],
    classify: async () => { throw new Error("Default-only never classifies"); },
  },
);
if (decision.status === "selected" || decision.status === "preserved") {
  // Your host applies decision.model and decision.effort after its own policy checks.
}
```

No built-in credential client, launcher, or registry is constructed. The caller provides validated configuration and its own adapters. Runtime config/request validation is still performed. The core never writes configuration; the package's menu/store are not public library APIs.

### `SelectionRequest`

| Field | Requirement / behavior |
| --- | --- |
| `task: string` | Required; bounded for classification, never persisted by this package. |
| `current: {model?, effort}` | Required; caller's current exact pair; effort always required. |
| `baseline: {model?, effort}` | Required; stable inherited default, not last worker. The primary TUI event owner supplies its own baseline. |
| `explicitModel?: {provider,id}` | Caller resolved an explicit model pin. Preserve it or return `invalid_explicit`; no silent substitute. |
| `explicitEffort?: Effort` | Caller resolved an explicit effort pin. Effort-only retains current model. |
| `requestedRole?: string` | Resolve a configured role directly; no semantic request. An unavailable role follows normal fallback; inspect role/fallback if exact role use is mandatory. |
| `paused?: boolean` | Default false; preserves current pair without classification. |
| `allowedModels?: readonly ModelRef[]` | Absent: adapter eligibility only. `[]`: no models. Also restricts the selector. Up to 10,000 exact refs. |
| `requiresImages?: boolean` | Default false; worker must support images. Caller inspects its own retained context/attachments without forwarding image bytes. |
| `signal?: AbortSignal` | Cancels selection; never cancellation of worker execution automatically. |

Precedence: explicit model/effort → paused → requested role → disabled configuration → default-only → classifier. Invalid explicit effort is not clamped. An inherited/current effort may be capability-clamped when paired with a different explicitly pinned model; requested/effective effort are returned separately. Resolve launcher frontmatter/run/provider precedence **before** calling: absence means permission to use automatic policy, not a request to override another package's explicit settings.

### `SelectionDependencies`

- `config: RoleConfig`: version-1 settings. A validated copy is used per call.
- `models(): readonly AvailableModel[]`: synchronous **cached** eligible registry. Each entry contains `ref`, supported `efforts`, `images`, and `contextWindow`. It is read again for final validation; never perform network discovery here.
- `classify(input): Promise<{text, usage?}>`: request contains exact selector `model`, standalone `systemPrompt`, bounded JSON `text`, `signal`, and `maxTokens`. Forward its signal; do not add execution tools/history or raw error logging. Timeout also settles uncooperative adapters; late results are ignored.
- `defaultEffort?(model): Effort`: per-model inherited effort; absent uses baseline effort.
- `now?(): number`: numeric clock for duration; default `Date.now`.

The adapter owns authentication/availability/scope, and should return trusted finite capability values. No authorization is granted by this API. Requests are process-local and independent; caller-owned objects/adapters must not be mutated concurrently while a call is outstanding.

### Decisions

All decisions contain `status`, `reason`, `fallback`, and safe `warnings`. `selected` and `preserved` also contain an exact `model`, effective `effort`, `requestedEffort`, and optional `role`. `unavailable` and `cancelled` do not contain an executable model. Optional `selector` contains model, nonnegative duration in milliseconds, and numeric `usage: {input, output, totalTokens, cost}` when supplied. Usage is selector-only and may not be reflected in Pi's ordinary worker totals.

Reasons (exported as `REASONS`):

| Reasons | Meaning |
| --- | --- |
| `explicit`, `manual`, `disabled` | Local preservation paths; no classifier. |
| `requested_role`, `default_only`, `matched` | Direct role/default or one validated semantic match. |
| `no_match`, `ambiguous`, `invalid_response` | Default fallback after classifier parsing. |
| `selector_failed`, `selector_timeout`, `selector_unavailable` | Transport/default-selector failure. |
| `input_too_large`, `insufficient_text`, `context_budget` | Classification bypass; default fallback. |
| `role_unavailable`, `no_usable_model` | Role disappeared or no permitted fallback exists. |
| `invalid_explicit`, `invalid_request`, `config_invalid` | Caller/config contract requires repair; no silent explicit-pin substitution. |
| `cancelled`, `stale`, `apply_failed` | Cancellation or TUI application lifecycle outcome. Pure library calls never apply a model. |

Warnings: `effort_clamped`, `roles_unavailable`, `default_unavailable`. No free-form model justification, task, description, raw exception, response, image content, or prompt hash enters a decision. Treat `fallback` and `status` as authoritative; `reason` explains which path occurred. Normal fallback is configured default → inherited baseline → current, deduplicated by exact identity. No arbitrary model is chosen and no task is replayed.

## Process-local events

Independently installed Pi packages need not import each other. A primary TUI owner registers **`pi-model-roles:select:v1`** on `pi.events`:

```ts
const event = {
  version: 1 as const,
  sessionId: ctx.sessionManager.getSessionId(),
  request: { task, current, baseline: current, signal },
  result: undefined as Promise<SelectionDecision> | undefined,
};
pi.events.emit("pi-model-roles:select:v1", event);
const decision = await event.result; // Undefined: no matching owner; do not launch.
```

See the complete typed [event client](../examples/selection-client.ts). Imported consumers may use `selectViaEvents(bus, sessionId, request)`, which converts an absent listener to `unavailable/selector_unavailable`.

The matching owner validates the request and assigns its **Promise synchronously**. Duplicate owners do not run a second request when `result` is already populated. Wrong session IDs are ignored. Disposal cancels outstanding service results and removes the listener. `registerSelectionService(bus, sessionId, handler)` is also exported for opt-in SDK hosts; it returns the disposer. The handler must itself be bounded/cooperative for resource cleanup, even though disposal settles caller promises.

This is advisory, **not a cross-process transport or security boundary**. Signals and Promises cannot be JSON-serialized into a remote request. The TUI owner uses its configuration/defaults, but does not inherit its manual parent pause into independent child requests: callers must supply child explicit provenance themselves. Parent model/effort is never switched by an event request. Reload replaces the owner; headless and known-child ambient instances register no automatic owner.

## Optional pi-subagents example

[examples/pi-subagents.ts](../examples/pi-subagents.ts) is **not** in `pi.extensions`. Load it explicitly alongside compatible pi-subagents and this package. It registers `/model-roles-delegate-example <task>` and a uniquely named, model-unpinned native demo agent through the public runtime-registration event.

It selects first, then sends the existing correlated `prompt-template:subagent:request` contract with:

- exact `model: provider + '/' + completeModelId` and separate `thinking`;
- fresh context, existing native launch preflight/policy, no model-role descriptions in execution prompts;
- a 25-second native timeout and 30-second result/cancel boundary;
- no artifacts requested, and no alternative runner or retry on denial/failure.

It observes the request/owner/node identity on responses and uses the package's cancel protocol. Registration is disposed on shutdown. Missing/incompatible owners are reported, never replaced by another execution mode. The exported `delegateExample` demonstrates optional explicit `{model, effort}` pins; real consumers must resolve their own agent/run defaults first.

Tested with **pi-subagents 0.65.1**, credential-free native child execution, embedded-slash model IDs, explicit effort, and parent isolation. Foreground children require their providers to be loaded in their own runtime; they do not inherit all parent extensions. The test fixture provisions its fake provider using pi-subagents' documented path-like tool extension contract and an isolated `PI_SUBAGENTS_TEMP_ROOT`. Known `PI_SUBAGENT_CHILD` ambient copies of this package remain inactive. No claim is made for arbitrary external CLI runners or uninstrumented subagent tools.
