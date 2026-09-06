# AGENTS.md

## Project

`pi-model-roles` is a package for Pi Agent that automatically selects an appropriate model for a task. Its job is to turn task intent and execution context into an explicit, predictable model-selection decision.

## Core principles

- Prefer deterministic, explainable routing over opaque heuristics.
- Preserve the caller's explicit model choice unless the public API documents an override.
- Keep selection policy separate from Pi integration and provider/model discovery.
- Treat unavailable, disabled, or misconfigured models as normal conditions; fall back safely and explain why.
- Never include secrets, prompts containing sensitive user data, or credentials in routing logs, errors, fixtures, or documentation.
- Make defaults conservative: a routing failure must not prevent Pi Agent from completing work when a usable fallback exists.

## Implementation guidance

- Define role/policy data declaratively where possible, rather than scattering model names and thresholds through control flow.
- Keep the public API small, typed, and backward-compatible. Document every configuration option and its default.
- Return structured selection metadata (selected model, role, fallback status, and non-sensitive reason) so decisions are debuggable.
- Isolate provider-specific behavior behind adapters; core task classification and role selection should remain provider-agnostic.
- Validate configuration at load time and produce actionable errors for invalid role definitions or unknown model identifiers.
- Avoid network calls on the routing hot path unless explicitly configured; cache discovery results with clear invalidation behavior.

## Testing

- Add unit coverage for normal routing, explicit overrides, missing-model fallbacks, invalid configuration, and deterministic tie-breaking.
- Use fake model registries/providers in tests; tests must not require credentials or live provider access.
- Include regression tests whenever routing behavior changes.
- Before finishing, run the repository's documented formatter, type-checker, linter, and test suite once they exist.

## Documentation and changes

- Any change that users need to know about must update the related documentation in the same change. Treat missing documentation as incomplete work, including for changes to installation, commands, configuration, defaults, routing, fallbacks, costs, privacy, compatibility, limitations, recovery, or public APIs.
- Start with README.md: keep it focused on what the package does, how it works, GitHub installation via github.com/spksoft/pi-model-roles, and everyday user instructions. Keep detailed configuration, integration, and troubleshooting guidance in the related docs and link to it.
- Keep command examples, YAML/API examples, documented defaults, and compatibility claims aligned with the implementation. Verify installation instructions against the actual package layout and build requirements; do not imply untested behavior is supported.
- Update CHANGELOG.md for user-visible behavior changes, and update the manual acceptance checklist when affected workflows change. Keep historical plans clearly labeled rather than presenting them as current user guidance.
- State compatibility requirements with Pi Agent and supported model providers explicitly.
- Keep commits focused; do not reformat or alter unrelated files.
