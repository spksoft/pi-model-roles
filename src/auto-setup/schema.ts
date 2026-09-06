import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { LIMITS, ROLE_ID } from "../core/defaults.js";
import { EFFORTS } from "../core/types.js";
import { AUTO_SETUP_LIMITS } from "./limits.js";

const exact = { additionalProperties: false } as const;
const text = (maxLength: number) =>
  Type.String({
    minLength: 1,
    maxLength,
    description: "Non-empty, trimmed text without line breaks or ASCII control characters.",
  });
const modelRef = Type.Object(
  { provider: text(LIMITS.modelField), id: text(LIMITS.modelField) },
  exact,
);
const roleDescription = Type.String({
  minLength: 1,
  maxLength: LIMITS.description,
  description:
    'Task-selection criteria only: preferably one compact "Use when" sentence with observable scope, uncertainty, risk, modality, or reasoning traits. Must be distinct from other roles and contain no model names, effort, benchmarks, prices, personas, tools, workflows, or execution instructions.',
});
const date = Type.String({
  pattern: "^\\d{4}-\\d{2}-\\d{2}$",
  description: "Calendar date in YYYY-MM-DD format.",
});
const source = Type.Object(
  {
    title: text(AUTO_SETUP_LIMITS.sourceTitle),
    url: Type.String({
      maxLength: AUTO_SETUP_LIMITS.url,
      pattern: "^https://",
      description: "HTTPS source URL without embedded credentials; agent-reported, not verified.",
    }),
    accessedAt: date,
    publishedAt: Type.Optional(date),
    benchmark: Type.Optional(text(AUTO_SETUP_LIMITS.sourceField)),
    result: Type.Optional(text(AUTO_SETUP_LIMITS.sourceField)),
    metric: Type.Optional(text(AUTO_SETUP_LIMITS.sourceField)),
    harness: Type.Optional(text(AUTO_SETUP_LIMITS.sourceField)),
    split: Type.Optional(text(AUTO_SETUP_LIMITS.sourceField)),
    version: Type.Optional(text(AUTO_SETUP_LIMITS.sourceField)),
  },
  exact,
);
const assessment = Type.Object(
  {
    model: modelRef,
    status: StringEnum([
      "official_sources_cited",
      "no_official_evidence_found",
      "offline_knowledge",
      "identity_unresolved",
    ] as const),
    summary: text(AUTO_SETUP_LIMITS.assessment),
    sources: Type.Array(source, {
      maxItems: AUTO_SETUP_LIMITS.sourcesPerCandidate,
      description:
        "Official citations require at least one source; offline knowledge requires none.",
    }),
    caveats: Type.Array(text(AUTO_SETUP_LIMITS.caveat), {
      maxItems: AUTO_SETUP_LIMITS.caveatsPerCandidate,
      description:
        'Required string array, e.g. ["Agent-reported; not independently verified."]. Use [] when none; never a scalar string.',
    }),
    upstream: Type.Optional(
      Type.Object(
        {
          provider: Type.String({ minLength: 1 }),
          id: Type.String({ minLength: 1 }),
          mappingSource: Type.Integer({
            minimum: 0,
            maximum: AUTO_SETUP_LIMITS.sourcesPerCandidate - 1,
            description:
              "Zero-based index of this assessment's source documenting the mapping. Omit upstream when identity is unresolved.",
          }),
        },
        exact,
      ),
    ),
  },
  exact,
);
const recommendation = {
  model: modelRef,
  effort: StringEnum(EFFORTS, {
    description: "One effort supported by this exact selected model.",
  }),
  rationale: text(AUTO_SETUP_LIMITS.roleRationale),
  effortRationale: text(AUTO_SETUP_LIMITS.effortRationale),
  evidenceModels: Type.Array(modelRef, {
    minItems: 1,
    maxItems: AUTO_SETUP_LIMITS.candidates,
    uniqueItems: true,
    description: "Distinct exact selected models used as the evidence basis.",
  }),
  uncertainty: text(AUTO_SETUP_LIMITS.caveat),
  tradeoff: Type.Optional(text(AUTO_SETUP_LIMITS.caveat)),
};

/** Model-facing shape. Runtime validation still enforces request-specific and safety constraints. */
export const autoSetupProposalSchema = Type.Object(
  {
    version: Type.Literal(1),
    summary: text(AUTO_SETUP_LIMITS.reportSummary),
    assessments: Type.Array(assessment, {
      minItems: 1,
      maxItems: AUTO_SETUP_LIMITS.candidates,
      description: "Exactly one assessment per selected provider/model pair.",
    }),
    roles: Type.Array(
      Type.Object(
        {
          id: Type.String({
            pattern: ROLE_ID.source,
            description:
              "Unique custom role ID; default, constructor, prototype and __proto__ are reserved.",
          }),
          description: roleDescription,
          ...recommendation,
        },
        exact,
      ),
      {
        maxItems: AUTO_SETUP_LIMITS.customRoles,
        description: "May be empty; no role is required.",
      },
    ),
    default: Type.Optional(
      Type.Object(recommendation, {
        ...exact,
        description: "Deliberate default change only. Omit to preserve the current default.",
      }),
    ),
  },
  exact,
);

export const autoSetupSubmissionSchema = Type.Object(
  {
    requestId: Type.String({ minLength: 8, maxLength: 128 }),
    generation: Type.Integer({ minimum: 1 }),
    proposal: autoSetupProposalSchema,
  },
  exact,
);
