import { displayModel } from "../core/model-identity.js";
import type { RoleConfig } from "../core/types.js";
import type {
  AutoSetupDraft,
  DefaultRecommendation,
  EvidenceSource,
  ModelAssessment,
} from "./types.js";

function sourceText(source: EvidenceSource, index: number): string {
  const fields = [
    ["published", source.publishedAt],
    ["benchmark", source.benchmark],
    ["result", source.result],
    ["metric", source.metric],
    ["harness", source.harness],
    ["split", source.split],
    ["version", source.version],
  ];
  const conditions = fields
    .filter(([, value]) => value !== undefined)
    .map(([label, value]) => `${label}: ${value}`)
    .join("; ");
  return `  - [${index + 1}] ${source.title}: ${source.url} (accessed ${source.accessedAt})${conditions ? `\n    ${conditions}` : ""}`;
}

function assessmentText(assessment: ModelAssessment): string {
  const sources = assessment.sources.length
    ? assessment.sources.map(sourceText).join("\n")
    : "  - No source URL reported.";
  const caveats = assessment.caveats.length ? `\n  Caveats: ${assessment.caveats.join("; ")}` : "";
  const upstream = assessment.upstream
    ? `\n  Claimed upstream: ${displayModel(assessment.upstream)} (mapping source [${assessment.upstream.mappingSource + 1}])`
    : "";
  return `${displayModel(assessment.model)} — ${assessment.status}\n  ${assessment.summary}${upstream}\n${sources}${caveats}`;
}

function recommendationText(role: DefaultRecommendation): string {
  return `  Why: ${role.rationale}\n  Effort rationale: ${role.effortRationale}\n  Evidence models: ${role.evidenceModels.map(displayModel).join(", ")}\n  Uncertainty: ${role.uncertainty}${role.tradeoff ? `\n  Trade-off: ${role.tradeoff}` : ""}`;
}

/** Render validated, bounded draft data without inventing evidence or evaluation results. */
export function autoSetupReport(draft: AutoSetupDraft): string {
  const roles = draft.proposal.roles.length
    ? draft.proposal.roles
        .map(
          (role) =>
            `${role.id}: ${displayModel(role.model)} · ${role.effort}\n  ${role.description}\n${recommendationText(role)}`,
        )
        .join("\n\n")
    : "No new custom roles recommended.";
  const suggested = draft.proposal.default;
  const defaultText = suggested
    ? `Suggested default: ${displayModel(suggested.model)} · ${suggested.effort}\n${recommendationText(suggested)}\n  Requires a separate default choice; also affects the selector.`
    : "Keep existing default (no replacement proposed).";
  return `Auto Setup report — agent-reported sources are not independently verified. Synthetic routing examples are design checks, not measured accuracy.\nResearch model: ${displayModel(draft.researchModel)}\nReceived: ${draft.receivedAt}\n\n${draft.proposal.summary}\n\nEvidence\n${draft.proposal.assessments.map(assessmentText).join("\n\n")}\n\nRecommended roles\n${roles}\n\nDefault settings\n${defaultText}\n\nAuto Setup preserves enabled and selectorTimeoutMs. Review retained roles for overlap before saving a partial merge.`;
}

function roleText(role: RoleConfig["roles"][string] | undefined): string {
  if (!role) return "(absent)";
  return JSON.stringify({
    model:
      role.model === "inherit" ? "inherit" : { provider: role.model.provider, id: role.model.id },
    effort: role.effort,
    ...("description" in role ? { description: role.description } : {}),
  });
}

/** Compare the actual merged config, including retained conflicts and default choice. */
export function autoSetupConfigDiff(before: RoleConfig, after: RoleConfig): string {
  return [...new Set([...Object.keys(before.roles), ...Object.keys(after.roles)])]
    .sort()
    .flatMap((id) => {
      const previous = roleText(before.roles[id]);
      const next = roleText(after.roles[id]);
      if (previous === next) return [];
      const kind = !before.roles[id] ? "add" : !after.roles[id] ? "delete" : "replace";
      return [`${kind}: ${id}\n  Before: ${previous}\n  After: ${next}`];
    })
    .join("\n\n");
}
