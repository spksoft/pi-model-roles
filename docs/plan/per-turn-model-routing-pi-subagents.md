# Historical proposal — not implemented as specified

**Withdrawn after review on 2026-09-07.** Pi 0.85.1 captures model/effort before `context`; that hook cannot apply the selected pair to the same request. pi-subagents 0.65.1 also does not establish child model-scope authority for this extension. The implementation therefore retains supported idle primary-TUI submission routing with task-only data, and the automatic-child compatibility probe fails closed without launching. See [current compatibility guidance](../compatibility.md#per-turn-routing-is-not-supported). The original proposal below (including its original hash) is retained for history, not as a completion claim.

## Original proposal: Per-turn model routing across Pi prompt sources > Generated

      2026-09-07T04:35:14.711Z ·
      sha256:8ab4e63149f73ff9d6d2ed918e77facafdd2aa77937d712a9ddbb91fafd5f101 ##
      Summary Expand enabled model-role routing from idle TUI input to every
      eligible primary Pi LLM request, using complete live textual message
      context and a narrowly opt-in native pi-subagents background-child bridge.
      ## Outcome Enabled routing makes a deterministic decision immediately
      before each eligible LLM request; it excludes image bytes and
      system/context-file material, never truncates oversized routing input,
      preserves explicit choices, and falls back safely. ## Acceptance criteria
      - Every configured primary Pi agent mode routes each eligible
      provider-bound LLM turn, including expanded prompts, queued work, retries,
      and tool-loop turns; non-LLM host/slash commands do not invoke selection.
      - Selector input is a deterministic full textual projection of
      provider-ready user, assistant/reasoning, tool-call, and tool-result text
      with typed boundaries; it excludes image bytes, assembled system prompts,
      AGENTS.md, skills, and context files. - Oversized full context is never
      truncated or summarized: selection is skipped and configured-default →
      baseline → current fallback leaves the LLM call executable. - Manual
      model/effort changes, explicit selection API requests, explicit
      pi-subagents per-run/agent pins, and stale/cancelled lifecycle work cannot
      be overwritten by automatic routing. - Automatic child routing runs only
      through a positively identified unpinned native pi-subagents
      background-child bridge; foreground, unbound, pinned, and external paths
      are untouched and get actionable guidance. - Tests and documentation cover
      lifecycle sources, context privacy/limits, image eligibility,
      races/fallbacks, supported child routing, and unsupported/pinned paths. ##
      Scope ### In scope - Primary Pi lifecycle routing in TUI and non-TUI agent
      modes with valid enabled configuration. - Text-only provider-ready message
      projection, per-turn cancellation/application/persistence safety, and
      existing model/image eligibility. - A public optional native pi-subagents
      background-child bridge built solely on public contracts. - Tests, README,
      guides, changelog, compatibility information, and manual checklist. ###
      Out of scope - Pi, pi-subagents, provider, dependency, or node_modules
      changes. - Universal interception of arbitrary pi-subagents launches,
      foreground children, unbound native children, or external runners. - Image
      bytes, assembled system prompts, AGENTS.md, skills, context files,
      credentials, or raw routing context persistence. - Lossy truncation,
      summarization, routing logs, or network discovery on the routing path. -
      Role YAML schema migration or weakened explicit-model precedence. ##
      Constraints - Implement only inside pi-model-roles. - Keep selection
      deterministic, provider-agnostic, bounded, and backward-compatible for
      public selection callers. - Routing failure must not prevent a usable LLM
      call. - Use only documented pi-subagents contracts; do not parse private
      configuration/source or infer undocumented pin provenance. - Continue
      image-capability enforcement while omitting image data from classifier
      requests. - Never serialize prompt/context text in decision metadata,
      configuration, diagnostics, fixtures, or docs. ## Findings - **Current
      routing is submission-only.** - `src/pi/controller.ts` `input()` accepts
      only idle interactive non-slash TUI input and constructs a request from
      `event.text`. - `src/extension.ts` delegates only its `input` lifecycle
      hook to controller routing. - Pi extension docs specify `context` fires
      before each LLM call with provider-ready messages. - **Core selection
      already provides bounded safe fallback.** - `src/core/selection.ts`
      handles timeout, cancellation, availability, selector-window checks, and
      configured-default/baseline/current fallback. - `src/core/defaults.ts`
      defines a 16,384-character task cap. - `src/pi/controller.ts` `apply()`
      revalidates models and guards stale/manual model-switch races. - **The
      requested data flow expands current task-only privacy semantics.** -
      `src/core/classifier-protocol.ts` currently serializes only role
      descriptions and `task`. - README and configuration documentation
      currently promise submitted-task text rather than history. - Pi
      `before_agent_start` exposes assembled system prompt/context-file details,
      but the agreed boundary expressly excludes them. - **pi-subagents has
      public opt-in seams but no universal safe child interception point.** -
      Its docs expose runtime-agent registration, in-process RPC, structured
      delegation, and extensionBindings as public seams. - Its documented
      precedence places per-run and agent model overrides over inherited/default
      models. - Its child-launch contract makes extension bindings available to
      native background runners, not foreground children, and external runners
      do not support them. - **Credential-free real lifecycle coverage exists.**
      - `test/support/sdk.ts` creates a real Pi SDK AgentSession and faux
      provider. - `test/integration/lifecycle.test.ts` covers reload, manual
      mode, cancellation, and modes. - `test/integration/pi-subagents.test.ts`
      uses the optional package's public event contract. ## Architecture
      design A pure context projector feeds the existing pure selector. A
      session-owned coordinator runs from Pi's pre-provider context event,
      aborts obsolete work, safely applies the exact turn's model, and
      stores only non-sensitive metadata. An optional bridge grants the same
      behavior to one owned, unpinned native background child path. ```mermaid
      flowchart TD A[Prompt, continuation, retry, or tool loop] --> B[Pi
      context event before provider request] B --> C[RolesController turn
      coordinator] C --> D[Deterministic textual message projection] D -->
      E{Complete projection fits limits?} E -- yes --> F[Bounded selector
      request] E -- no --> G[Safe default/baseline/current fallback] F -->
      H[Validate and apply exact turn model] G --> I[Provider request] H
      --> I J[Manual change, reload, tree, shutdown] --> K[Abort and
      increment generation] K --> C L[Owned native background pi-subagents
      bridge] --> M[Validated child binding] M --> C N[Foreground, pinned,
      unbound, external child] --> O[No interception; diagnostic or explicit
      API] ``` ## Implementation tasks ### T1 — Define a deterministic, private
      full-context projection **What:** Add a pure routing-context layer that
      converts the complete provider-ready message list into classifier text and
      returns image/size metadata. **Why:** Per-turn routing needs complete live
      textual context, while current selection accepts only submitted task text
      and must not expose images or system-context material. **How:** Create a
      core projector with stable role/block delimiters and field ordering.
      Include textual user, assistant, reasoning, tool-call arguments, and
      tool-result/error content; independently detect images for execution model
      eligibility; omit binary/image payloads. Treat unknown non-text payloads
      conservatively. Keep system prompt and `before_agent_start`
      systemPromptOptions outside this interface. Measure the complete
      projection before selection; add an explicit oversized-context reason and
      use existing fallback instead of shortening, summarizing, or persisting
      it. Keep `SelectionRequest.task` compatible for public callers.
      **Files/modules:** src/core/routing-context.ts, src/core/types.ts,
      src/core/defaults.ts, src/core/classifier-protocol.ts,
      src/core/selection.ts, src/pi/session-state.ts,
      test/unit/routing-context.test.ts, test/unit/selection.test.ts,
      test/unit/privacy.test.ts **Depends on:** None **Validation:** - Unit
      tests cover message/block ordering, multilingual text, reasoning, tool
      calls, tool results/errors, text-plus-image, and malformed/unknown
      payloads. - Projection tests prove no image bytes, assembled system
      prompt, context-file contents, or credentials flow to classifier text. -
      Exact-fit and one-unit-over character/byte/window tests prove no partial
      projection is classified. - Decision/session data assertions prove no raw
      routing text is retained. #### Subtasks ##### T1.1 — Specify canonical
      text and image metadata **What:** Define the projector's supported
      block mapping and image-presence result. **Why:** The classifier needs
      unambiguous text boundaries and model selection still needs image
      capability facts. **How:** Use explicit labels for message role and block
      type, stable JSON-like field order where a block has multiple textual
      fields, and a separate boolean/image metadata result without carrying
      payload bytes. **Files/modules:** src/core/routing-context.ts,
      test/unit/routing-context.test.ts **Depends on:** T1 **Validation:** -
      Equal input messages produce byte-identical projection output. -
      Image-only and mixed-content cases preserve image eligibility while
      leaking no bytes. ##### T1.2 — Connect complete-input limits to selection
      decisions **What:** Extend selection reason/type handling for a complete
      context that cannot fit. **Why:** The agreed policy is full context or no
      classification, not a lossy approximation. **How:** Add the minimal public
      reason/docs contract and call the existing safe fallback chain before the
      classifier if character or selector capacity checks fail; leave ordinary
      selection API task behavior unchanged. **Files/modules:**
      src/core/types.ts, src/core/defaults.ts, src/core/classifier-protocol.ts,
      src/core/selection.ts, test/unit/selection.test.ts **Depends on:** T1.1
      **Validation:** - Fallback model ordering matches existing configured
      default, baseline, then current behavior. - Classifier mock is not called
      for rejected complete projections. ### T2 — Route from Pi's
      pre-provider lifecycle on every primary turn **What:** Refactor controller
      state from interactive input submission routing into a session-scoped
      context-turn coordinator and register it with Pi lifecycle events.
      **Why:** Pi's `input` hook misses skill/template expansion and all
      later turns; `context` is the documented hook immediately before every LLM
      provider call. **How:** Add `turn_start`/`context` lifecycle wiring in
      `src/extension.ts`. Refactor `RolesController` to build a full-context
      request, select once, and apply only a live session/generation token.
      Decouple activation from TUI for primary agent modes while keeping
      missing/default-only configuration non-invasive. Replace active-agent
      modal loader use with status-safe behavior. Retain input processing only
      for Auto Setup/ordinary input. Ensure every request carries actual current
      state, baseline, manual/disabled status, and image requirement. Preserve
      `setPair` expected-change handling and make session state/decision
      recording non-sensitive and deduplicated. **Files/modules:**
      src/pi/controller.ts, src/pi/session-state.ts, src/pi/adapters.ts,
      src/extension.ts, src/ui/selection-loader.ts,
      test/integration/lifecycle.test.ts,
      test/integration/context-and-queue.test.ts, test/support/sdk.ts **Depends
      on:** T1.2 **Validation:** - Real SDK tests assert selector then
      execution-model ordering for initial expanded work and later tool-loop
      turns. - Configured TUI, print, JSON, and RPC primary sessions route
      actual LLM calls; absent/default-only config stays non-disruptive. -
      Queued continuation, retry, programmatic prompt, and tool-loop cases route
      only when a provider request occurs. - Slash/extension commands without an
      LLM call make no selector request. #### Subtasks ##### T2.1 — Coordinate
      turns, cancellation, and stale application **What:** Create per-turn abort
      ownership separate from old interactive pending state. **Why:** Selection
      and model application await points otherwise permit stale work after
      manual choices or lifecycle transitions. **How:** Track current session
      ID, generation, and turn abort controller; cancel on reload, tree,
      shutdown, manual model/effort change, and relevant replacement. Recheck
      authority before/after selection and apply; preserve finite fallback and
      do not open UI prompts while an agent is active. **Files/modules:**
      src/pi/controller.ts, src/extension.ts,
      test/integration/lifecycle.test.ts,
      test/integration/context-and-queue.test.ts **Depends on:** T1.2
      **Validation:** - Delayed selection/application race tests cover manual
      change, reload, tree, shutdown, and cancellation without leaving stale
      model/effort selected. - Timeout, selector error, and cancellation still
      allow the provider call with safe fallback/current state. ##### T2.2 —
      Persist only useful non-sensitive per-turn state **What:** Adapt status,
      restore markers, and decision entries for repeated routing. **Why:** Tool
      loops may repeat a role decision; session restore needs state without
      creating a context log or duplicate churn. **How:** Compare effective
      model/effort and deduplicate unchanged decision/state entries. Persist
      only existing model, effort, role, reason, warnings, and selector usage
      metadata. Preserve manual pause and explicit `/model-roles use`
      precedence. **Files/modules:** src/pi/controller.ts,
      src/pi/session-state.ts, test/integration/lifecycle.test.ts,
      test/unit/privacy.test.ts **Depends on:** T2.1 **Validation:** -
      Multi-turn tests show no projected text in custom entries and no duplicate
      unchanged records. - Reload/tree tests retain current mode, baseline, and
      safe role semantics. ### T3 — Implement an opt-in native pi-subagents
      background-child bridge **What:** Create a public optional bridge and
      child entry that enable automatic per-turn routing only for an owned,
      unpinned native background child. **Why:** Explicit per-run and agent pins
      must win, and pi-subagents exposes no safe universal interception hook for
      arbitrary child launches. **How:** Use only documented public
      runtime-agent registration/RPC/extension-binding contracts, without a
      production runtime dependency on pi-subagents. Parent bridge
      capability-checks the owner, creates a generated per-session route-owned
      native agent with no model/effort pin, launches only the supported
      background path with a versioned `pi-model-roles/1` authority binding, and
      explicitly loads the child entry. The child validates binding before
      enabling print-mode controller routing. Reject or diagnose unavailable
      owner, bad protocol/binding, model/effort pin, foreground mode, external
      runner, and unowned paths; direct callers retain `selectViaEvents` as the
      explicit alternative. **Files/modules:** src/integrations/pi-subagents.ts,
      src/integrations/pi-subagents-child.ts, src/index.ts, src/extension.ts,
      examples/pi-subagents.ts, package.json,
      test/integration/pi-subagents.test.ts, test/support/sdk.ts **Depends on:**
      T2.2 **Validation:** - Optional-package integration launches a valid owned
      native background child and observes per-turn child selection before
      execution. - Explicit per-run and agent-pinned routes remain
      preserved/rejected rather than rerouted. - Foreground, unbound native, and
      external/unsupported paths never activate child routing and return
      actionable diagnostics. - Bridge import/use works with pi-subagents
      absent. #### Subtasks ##### T3.1 — Define parent bridge authority and
      diagnostics **What:** Implement versioned binding/capability validation
      and a public result contract. **Why:** Positive route authority must be
      explicit and auditable rather than guessed from child environment or model
      state. **How:** Require generated owned-agent identity, exact binding
      namespace/version, native-background capability, and no supplied
      model/effort; return bounded non-sensitive reason/remediation values for
      unsupported states. **Files/modules:** src/integrations/pi-subagents.ts,
      src/core/types.ts, src/index.ts, test/integration/pi-subagents.test.ts
      **Depends on:** T2.2 **Validation:** - Fixtures cover no owner, malformed
      response, bad capabilities/binding, pin input, and successful authority. -
      Type/package checks prove no optional dependency becomes required at
      runtime. ##### T3.2 — Gate child activation on validated route authority
      **What:** Implement a separate child extension entry that uses shared turn
      routing only when the bridge binding is valid. **Why:**
      `PI_SUBAGENT_CHILD` or ambient extension loading alone cannot prove a
      child is unpinned. **How:** Strictly parse the bound JSON, initialize
      cleanup-scoped child controller state only for supported background print
      hosts, and leave foreground and unbound hosts inactive. **Files/modules:**
      src/integrations/pi-subagents-child.ts, src/pi/controller.ts,
      src/extension.ts, test/integration/pi-subagents.test.ts **Depends on:**
      T3.1 **Validation:** - No-binding child case makes zero selection
      requests; valid binding routes each child LLM turn. - Child
      cancellation/shutdown releases local state and cannot affect parent
      controller state. ### T4 — Align documentation, examples, and
      compatibility claims **What:** Update user and maintainer docs for
      per-turn cost/data flow, full-context limits, and narrow pi-subagents
      support. **Why:** Existing docs promise task-only data and one selector
      request before a new prompt, which becomes inaccurate. **How:** Revise
      README, configuration limit/privacy/recovery sections, architecture flow,
      API docs, compatibility matrix, changelog, example, and manual checklist.
      Explain that every LLM turn may add a selector request; full textual
      user/assistant/reasoning/tool content can be sent to the configured
      selector; system/context files and image bytes are excluded; oversize
      input falls back without truncation; and bridge-only child routing
      preserves pins. Document explicit selection API remediation for excluded
      paths. **Files/modules:** README.md, docs/configuration.md,
      docs/architecture.md, docs/api.md, docs/compatibility.md, CHANGELOG.md,
      examples/pi-subagents.ts, test/manual/tui-checklist.md **Depends on:**
      T3.2 **Validation:** - Documentation/package tests and link checks pass. -
      No documentation still claims task-only or one-per-new-prompt automatic
      selection. - Supported bridge example and every unsupported-path
      remediation match the implemented public contract. #### Subtasks #####
      T4.1 — Document lifecycle, privacy, cost, and fallback behavior **What:**
      Replace submission-time routing language with exact per-provider-turn
      behavior. **Why:** Users need informed consent and predictable behavior in
      long/tool-heavy sessions. **How:** State inclusion/exclusion lists, no
      persistence/logging guarantee, image enforcement, no-truncation policy,
      safe fallback ordering, and selector cost implications. **Files/modules:**
      README.md, docs/configuration.md, docs/architecture.md, CHANGELOG.md
      **Depends on:** T2.2 **Validation:** - Review confirms all limits/privacy
      examples match implementation and contain no sensitive content. ##### T4.2
      — Document child bridge limits and alternatives **What:** Publish setup,
      capability requirements, diagnostics, pin precedence, and explicit API
      alternative. **Why:** The bridge must not be mistaken for universal
      subagent interception. **How:** Add API example and compatibility table
      for owned native background, pinned, foreground, unbound, and external
      paths; link `selectViaEvents` for controlled pre-launch selection.
      **Files/modules:** docs/api.md, docs/compatibility.md, README.md,
      examples/pi-subagents.ts, test/manual/tui-checklist.md **Depends on:**
      T3.2 **Validation:** - Each excluded path has a concrete safe next action
      and is not claimed as automatically routed. ### T5 — Execute quality gates
      and regression matrix **What:** Run the repository formatter, type
      checker, linter, tests, documentation checks, and diagnostics after
      implementation. **Why:** The change crosses public types, Pi lifecycle
      behavior, optional integrations, and privacy guarantees. **How:** Extend
      faux-provider fixtures only as needed for expanded
      prompt/multiple-turn/child-binding behavior. Run targeted tests during
      work, then scripts in `package.json`; run LSP/lens diagnostics and inspect
      final diff for leaked context in tests/docs. **Files/modules:**
      package.json, test/support/sdk.ts, test/support/fixtures.ts,
      test/unit/routing-context.test.ts, test/integration/lifecycle.test.ts,
      test/integration/context-and-queue.test.ts,
      test/integration/pi-subagents.test.ts, test/unit/documentation.test.ts
      **Depends on:** T4.2 **Validation:** - All documented package scripts for
      formatting, lint, types, tests, and docs/package assertions pass. -
      Targeted lifecycle and optional pi-subagents tests pass without live
      credentials. - LSP/lens diagnostics show no blocking errors in edited
      files. - Final privacy review finds no raw prompt/context in output,
      fixtures, session expectations, diagnostics, or docs. #### Subtasks #####
      T5.1 — Expand deterministic real-SDK lifecycle fixtures **What:** Assert
      selector/execution ordering over repeated provider calls without
      network/timing dependence. **Why:** Coverage must prove source and turn
      completeness, not infer it from a single interactive prompt. **How:** Add
      explicit faux response sequences/event observations for expansion, tool
      loops, queued execution, errors/retries, and multiple modes.
      **Files/modules:** test/support/sdk.ts,
      test/integration/lifecycle.test.ts,
      test/integration/context-and-queue.test.ts **Depends on:** T2.2
      **Validation:** - Tests assert selector and execution count/model for
      every eligible turn. - Race tests remain repeatable. ##### T5.2 — Verify
      bridge and no-leak matrix **What:** Exercise optional public contracts and
      privacy boundaries together. **Why:** The bridge is
      compatibility-sensitive and full-text routing raises privacy regression
      risk. **How:** Use public pi-subagents events/RPC only; add
      pin/unsupported/no-binding assertions and scan classifier/decision/session
      test data for raw text. **Files/modules:**
      test/integration/pi-subagents.test.ts, test/unit/privacy.test.ts,
      test/unit/documentation.test.ts **Depends on:** T3.2, T4.2 **Validation:**
      - Dependency absence yields documented graceful behavior. - Pin,
      unsupported, invalid-binding, and no-log assertions pass. ## Engineering
      considerations ### architecture Keep projection pure and
      provider-agnostic; isolate lifecycle and child integration from core
      selection policy. ### security Treat message text as sensitive; exclude
      system/context/image data, validate bindings, avoid logs/persistence, and
      fail closed on unknown authority. ### data-and-migrations No YAML
      migration; additive reason/metadata changes must preserve restoration and
      omit routing text. ### testing Use pure projection tests, real SDK
      lifecycle/race/mode tests, optional public-contract child tests, docs
      tests, and privacy assertions. ### rollout-and-rollback Use staged
      fail-closed rollout: primary routing remains governed by enabled state,
      the child bridge is independently opt-in, unsupported paths are untouched,
      and every failure preserves a usable model. ### observability Keep only
      model/role/reason/usage/status data, deduplicate repeated decisions,
      provide remediation diagnostics, and never emit projection text. ###
      performance-and-accessibility Per-turn bounded requests are intentional
      and disclosed; avoid modal UI during agent loops, keep status concise, and
      use no routing-path discovery calls. ## Required risk controls
      **Completion gate: no unmitigated high-severity implementation risk.** The
      implementation is not complete unless every required control is
      implemented and verified. The design fails closed: unsafe, stale,
      oversized, unsupported, or unverifiable routing leaves Pi on its safe
      configured-default → baseline → current model path. - **Private, bounded
      data flow:** project only provider-ready text; exclude image bytes, system
      prompts, AGENTS.md, skills, and context files; never persist or log
      projections; skip classification rather than truncate. Prove this with
      projection, privacy, boundary, and session-entry tests. - **Stale-switch
      prevention:** use session/generation authority, per-turn abort
      controllers, expected-change guards, and pre-apply revalidation. Prove
      this with delayed manual-change, reload, tree, shutdown, cancellation, and
      replacement-turn tests. - **Verified child authority:** enable only an
      explicitly bound, generated route-owned native background child with no
      model/effort pin. Prove pinned, foreground, unbound, and external paths
      remain untouched and give remediation. - **Predictable overload
      behavior:** make at most one bounded selector attempt per turn,
      deduplicate metadata, avoid active-agent modal UI, and fall back safely on
      timeout or capacity exhaustion. - **Version-safe bridge and rollback:**
      require documented capability/version validation, keep primary routing
      independent of bridge availability, retain enabled/disabled routing
      control, and never block a provider request for routing failure. ##
      Residual operating limits These are intentional product boundaries after
      the required controls pass, not accepted implementation risks. - **Full
      textual context may be sensitive or costly:** accurate disclosure applies;
      protected system/context-file and image data remain excluded; routing text
      is never logged or persisted. - **Complete context may not fit the
      selector:** no partial context is classified; the selector is skipped and
      the safe fallback model executes the turn. - **Some pi-subagents paths are
      unsupported:** pinned, foreground, unbound, and external paths are
      intentionally not intercepted; the bridge gives diagnostics and the
      explicit selection API remains available. - **Optional host contracts may
      be unavailable:** the bridge stays disabled without affecting primary
      routing; diagnostics identify the unsupported capability or version. ##
      Assumptions - Pi continues to await `context` handlers before every
      provider request with provider-ready non-system messages. - If false:
      Per-turn pre-provider routing cannot be safely implemented at extension
      level; scope must reduce to pre-agent routing. - Pi permits model/effort
      setting from a context handler before dispatch. - If false: A supported
      host pre-provider model API would be required; otherwise later turns
      cannot be rerouted. - Tested pi-subagents continues to expose documented
      runtime registration, RPC/background native launch, and extensionBindings
      contracts. - If false: Disable bridge with diagnostic while retaining
      primary Pi routing. - Generated route-owned no-pin agent plus explicit
      binding is sufficient proof for supported child authority. - If false:
      Narrow child support to explicit pre-launch selection only; do not claim
      automatic child routing. - Existing fallback ordering and configuration
      limits remain public defaults. - If false: A separate config
      version/migration decision would be required. ## Open questions ##
      End-to-end validation - Run every formatter, linter, type, test,
      documentation, and package check declared in `package.json`. - Run
      targeted unit and real-SDK lifecycle/context/queue/pi-subagents
      integration suites while iterating. - Use LSP and lens diagnostics on
      edited files before completion. - Manually run a TUI multi-turn tool task,
      manual pause, reload, and supported/unsupported child scenarios from the
      updated checklist.
