import { displayModel } from "../core/model-identity.js";
import type { AvailableModel, ModelRef } from "../core/types.js";
import { AUTO_SETUP_LIMITS } from "./limits.js";
import type { AutoSetupDraft } from "./types.js";

export class AutoSetupPromptError extends Error {
  constructor(public readonly code: "too_large" | "invalid_question") {
    super(code);
    this.name = "AutoSetupPromptError";
  }
}

function bounded(value: string): string {
  if (Buffer.byteLength(value, "utf8") > AUTO_SETUP_LIMITS.promptBytes)
    throw new AutoSetupPromptError("too_large");
  return value;
}

function candidatesText(candidates: readonly AvailableModel[]): string {
  return candidates
    .map(
      (candidate, index) =>
        `${index + 1}. ${displayModel(candidate.ref)}; supported efforts: ${candidate.efforts.join(", ")}; context: ${candidate.contextWindow}; images: ${candidate.images ? "yes" : "no"}`,
    )
    .join("\n");
}

function modelId(model: ModelRef): string {
  return `${model.provider}/${model.id}`;
}

export const proposalSubmissionGuidance =
  "Use model_roles_submit_auto_setup_proposal only for an active Auto Setup request. Submit one accepted proposal; after a validation rejection, correct the reported fields and retry once with the same requestId and generation. Stop after acceptance, an inactive request, or a second rejection. It stores a review draft and never applies configuration.";

const proposalContract = `The tool call takes { requestId, generation, proposal }. The proposal must use this exact contract; unknown keys are rejected:
- proposal: { version: 1, summary, assessments, roles, default? }. Do not add schemaVersion, kind, metadata, or routing fields.
- assessments: exactly one per selected model. Each is { model: { provider, id }, status, summary, sources, caveats, upstream? }. status is one of official_sources_cited, no_official_evidence_found, offline_knowledge, identity_unresolved.
- caveats: a required array of zero to ${AUTO_SETUP_LIMITS.caveatsPerCandidate} non-empty strings, each at most ${AUTO_SETUP_LIMITS.caveat} characters; never provide a scalar string. Example: "caveats": ["Agent-reported; not independently verified."]. Use [] when none.
- sources: an array of at most ${AUTO_SETUP_LIMITS.sourcesPerCandidate} records per assessment; each is { title, url, accessedAt, publishedAt?, benchmark?, result?, metric?, harness?, split?, version? }. url must be HTTPS; accessedAt and publishedAt use YYYY-MM-DD. official_sources_cited requires at least one source; offline_knowledge requires none.
- upstream, when documented by a source in that assessment, is { provider, id, mappingSource }, where mappingSource is that assessment's zero-based source index. Do not include upstream when identity is unresolved.
- roles: an array of at most ${AUTO_SETUP_LIMITS.customRoles} recommendations; may be empty. Each proposed role is { id, model: { provider, id }, effort, description, rationale, effortRationale, evidenceModels, uncertainty, tradeoff? }. model and every evidenceModels entry must be a selected exact model; effort must be supported by that model.
- default is optional and deliberate only: { model: { provider, id }, effort, rationale, effortRationale, evidenceModels, uncertainty, tradeoff? }. Omit it to preserve the current default.
- summary, description, rationale, effortRationale, uncertainty, and tradeoff are strings, not arrays. evidenceModels is a non-empty array of distinct { provider, id } objects.
All text fields must be non-empty, trimmed, and without line breaks or ASCII control characters. Follow the tool schema's string-length and array-size limits. Use no other keys at any level.`;

export function buildResearchPrompt(input: {
  requestId: string;
  generation: number;
  candidates: readonly AvailableModel[];
}): string {
  return bounded(`You are performing a pi-model-roles Auto Setup research pass. This is a recommendation and report task only. Do not edit files, configuration, provider credentials, tools, models, or settings. This instruction is not a sandbox: use only research-appropriate tools that are already available to you.

Research every exact selected serving model below. If web/search tools are available, prefer first-party provider/developer model cards, release notes, and performance pages. Do not guess that a gateway alias is an upstream model. You may associate a serving model with an upstream developer model only when you include a source that documents that mapping. If research cannot obtain official evidence, honestly use one of no_official_evidence_found, offline_knowledge, or identity_unresolved. Offline knowledge means no web evidence was obtained; it is not local execution and cannot carry citations or measured benchmark claims.

For each model, report exactly one assessment with status official_sources_cited, no_official_evidence_found, offline_knowledge, or identity_unresolved. Source URLs are agent-reported, not independently verified. Include reported access dates, publication dates when known, benchmark result/metric/harness/split/version only when the source supports them, and meaningful caveats. Never invent citations, prices, latency, benchmark results, or comparable aggregate scores.

Recommend zero or more roles. A selected model does not require a role. Every proposed role must use one selected exact model and one of its supported efforts, explain when it applies, why the model and effort fit, its evidence basis, uncertainty, and a trade-off when relevant. It may conclude that no new role is useful. Do not change default configuration unless you submit a deliberate default recommendation.

${proposalContract}

Selected candidates:
${candidatesText(input.candidates)}

When ready, call model_roles_submit_auto_setup_proposal with requestId ${JSON.stringify(input.requestId)}, generation ${input.generation}, and a complete structured proposal. ${proposalSubmissionGuidance} Do not rely on prose alone; the proposal tool is the only Auto Setup handoff. Its result will be reviewed by the user only after this normal agent run settles.`);
}

export function buildRefinementPrompt(input: {
  requestId: string;
  generation: number;
  draft: AutoSetupDraft;
  question: string;
}): string {
  if (!input.question.trim() || input.question.trim() !== input.question)
    throw new AutoSetupPromptError("invalid_question");
  const text = `Continue the pi-model-roles Auto Setup discussion. Do not edit files, configuration, credentials, tools, models, or settings. Use only research-appropriate configured tools; this instruction is not a sandbox.

The user asks: ${JSON.stringify(input.question)}

Here is the previous bounded, user-reviewable proposal. It is agent-reported evidence, not verified fact. Keep exact selected refs and supported efforts. If you revise it, call model_roles_submit_auto_setup_proposal with requestId ${JSON.stringify(input.requestId)}, generation ${input.generation}, and a complete replacement proposal. ${proposalSubmissionGuidance} If no revision is warranted, explain that in prose; the prior reviewed draft stays available.

${proposalContract}

Previous proposal:\n${JSON.stringify(input.draft.proposal)}`;
  return bounded(text);
}

export function researchModelLabel(model: ModelRef | undefined): string {
  return model ? modelId(model) : "no active model";
}
