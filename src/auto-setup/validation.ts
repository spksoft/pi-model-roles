import { ROLE_ID, RESERVED_IDS, charLength } from "../core/defaults.js";
import { isEffort, isModelRef, isRecord, modelKey } from "../core/model-identity.js";
import type { AvailableModel, ModelRef } from "../core/types.js";
import { AUTO_SETUP_LIMITS } from "./limits.js";
import type {
  AutoSetupProposal,
  DefaultRecommendation,
  EvidenceSource,
  EvidenceStatus,
  ModelAssessment,
  RoleRecommendation,
  UpstreamIdentity,
} from "./types.js";

export class AutoSetupValidationError extends Error {
  constructor(
    public readonly code: string,
    public readonly field = "proposal",
  ) {
    super(`${code}: ${field}`);
    this.name = "AutoSetupValidationError";
  }
}

function rejectUnknown(
  value: Record<string, unknown>,
  allowed: readonly string[],
  field: string,
): void {
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    throw new AutoSetupValidationError("unknown_field", field);
}

function bytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function safeText(value: unknown, limit: number, field: string): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim() !== value ||
    charLength(value) > limit ||
    Array.from(value).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
  )
    throw new AutoSetupValidationError("invalid_text", field);
  return value;
}

function date(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new AutoSetupValidationError("invalid_date", field);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value)
    throw new AutoSetupValidationError("invalid_date", field);
  return value;
}

function url(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length > AUTO_SETUP_LIMITS.url || value.trim() !== value)
    throw new AutoSetupValidationError("invalid_url", field);
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || !parsed.hostname)
      throw new Error("unsafe");
  } catch {
    throw new AutoSetupValidationError("invalid_url", field);
  }
  return value;
}

function model(value: unknown, field: string): ModelRef {
  if (!isModelRef(value)) throw new AutoSetupValidationError("invalid_model", field);
  return { provider: value.provider, id: value.id };
}

function refList(value: unknown, candidates: readonly AvailableModel[], field: string): ModelRef[] {
  if (!Array.isArray(value) || !value.length || value.length > AUTO_SETUP_LIMITS.candidates)
    throw new AutoSetupValidationError("invalid_evidence_models", field);
  const refs = value.map((item, index) => model(item, `${field}[${index}]`));
  const allowed = new Set(candidates.map((candidate) => modelKey(candidate.ref)));
  if (
    refs.some((ref) => !allowed.has(modelKey(ref))) ||
    new Set(refs.map(modelKey)).size !== refs.length
  )
    throw new AutoSetupValidationError("unknown_evidence_model", field);
  return refs;
}

function source(value: unknown, field: string): EvidenceSource {
  if (!isRecord(value)) throw new AutoSetupValidationError("expected_source", field);
  rejectUnknown(
    value,
    [
      "title",
      "url",
      "accessedAt",
      "publishedAt",
      "benchmark",
      "result",
      "metric",
      "harness",
      "split",
      "version",
    ],
    field,
  );
  const optional = (key: "benchmark" | "result" | "metric" | "harness" | "split" | "version") =>
    value[key] === undefined
      ? undefined
      : safeText(value[key], AUTO_SETUP_LIMITS.sourceField, `${field}.${key}`);
  return {
    title: safeText(value.title, AUTO_SETUP_LIMITS.sourceTitle, `${field}.title`),
    url: url(value.url, `${field}.url`),
    accessedAt: date(value.accessedAt, `${field}.accessedAt`),
    ...(value.publishedAt === undefined
      ? {}
      : { publishedAt: date(value.publishedAt, `${field}.publishedAt`) }),
    ...(optional("benchmark") === undefined ? {} : { benchmark: optional("benchmark") }),
    ...(optional("result") === undefined ? {} : { result: optional("result") }),
    ...(optional("metric") === undefined ? {} : { metric: optional("metric") }),
    ...(optional("harness") === undefined ? {} : { harness: optional("harness") }),
    ...(optional("split") === undefined ? {} : { split: optional("split") }),
    ...(optional("version") === undefined ? {} : { version: optional("version") }),
  };
}

function upstream(value: unknown, sourceCount: number, field: string): UpstreamIdentity {
  if (!isRecord(value)) throw new AutoSetupValidationError("invalid_upstream", field);
  rejectUnknown(value, ["provider", "id", "mappingSource"], field);
  const mappingSource = value.mappingSource;
  if (
    typeof value.provider !== "string" ||
    !value.provider.trim() ||
    value.provider.trim() !== value.provider ||
    typeof value.id !== "string" ||
    !value.id.trim() ||
    value.id.trim() !== value.id ||
    typeof mappingSource !== "number" ||
    !Number.isInteger(mappingSource) ||
    mappingSource < 0 ||
    mappingSource >= sourceCount
  )
    throw new AutoSetupValidationError("invalid_upstream", field);
  return { provider: value.provider, id: value.id, mappingSource };
}

function assessment(
  value: unknown,
  candidates: readonly AvailableModel[],
  field: string,
): ModelAssessment {
  if (!isRecord(value)) throw new AutoSetupValidationError("expected_assessment", field);
  rejectUnknown(value, ["model", "status", "summary", "sources", "caveats", "upstream"], field);
  const ref = model(value.model, `${field}.model`);
  const candidate = candidates.find((item) => modelKey(item.ref) === modelKey(ref));
  if (!candidate) throw new AutoSetupValidationError("unselected_model", `${field}.model`);
  const status = value.status;
  if (
    status !== "official_sources_cited" &&
    status !== "no_official_evidence_found" &&
    status !== "offline_knowledge" &&
    status !== "identity_unresolved"
  )
    throw new AutoSetupValidationError("invalid_evidence_status", `${field}.status`);
  if (!Array.isArray(value.sources) || value.sources.length > AUTO_SETUP_LIMITS.sourcesPerCandidate)
    throw new AutoSetupValidationError("invalid_sources", `${field}.sources`);
  const sources = value.sources.map((item, index) => source(item, `${field}.sources[${index}]`));
  if (status === "official_sources_cited" && !sources.length)
    throw new AutoSetupValidationError("missing_official_source", `${field}.sources`);
  if (status === "offline_knowledge" && sources.length)
    throw new AutoSetupValidationError("offline_has_sources", `${field}.sources`);
  if (!Array.isArray(value.caveats) || value.caveats.length > AUTO_SETUP_LIMITS.caveatsPerCandidate)
    throw new AutoSetupValidationError("invalid_caveats", `${field}.caveats`);
  const caveats = value.caveats.map((item, index) =>
    safeText(item, AUTO_SETUP_LIMITS.caveat, `${field}.caveats[${index}]`),
  );
  const result: ModelAssessment = {
    model: ref,
    status: status as EvidenceStatus,
    summary: safeText(value.summary, AUTO_SETUP_LIMITS.assessment, `${field}.summary`),
    sources,
    caveats,
  };
  if (value.upstream !== undefined) {
    if (!sources.length)
      throw new AutoSetupValidationError("mapping_without_source", `${field}.upstream`);
    result.upstream = upstream(value.upstream, sources.length, `${field}.upstream`);
  }
  if (status === "identity_unresolved" && result.upstream)
    throw new AutoSetupValidationError("resolved_identity_status", `${field}.status`);
  return result;
}

function role(
  value: unknown,
  candidates: readonly AvailableModel[],
  field: string,
): RoleRecommendation {
  if (!isRecord(value)) throw new AutoSetupValidationError("expected_role", field);
  rejectUnknown(
    value,
    [
      "id",
      "model",
      "effort",
      "description",
      "rationale",
      "effortRationale",
      "evidenceModels",
      "uncertainty",
      "tradeoff",
    ],
    field,
  );
  if (
    typeof value.id !== "string" ||
    value.id === "default" ||
    !ROLE_ID.test(value.id) ||
    RESERVED_IDS.has(value.id)
  )
    throw new AutoSetupValidationError("invalid_role_id", `${field}.id`);
  const ref = model(value.model, `${field}.model`);
  const candidate = candidates.find((item) => modelKey(item.ref) === modelKey(ref));
  if (!candidate) throw new AutoSetupValidationError("unselected_model", `${field}.model`);
  if (!isEffort(value.effort) || !candidate.efforts.includes(value.effort))
    throw new AutoSetupValidationError("unsupported_effort", `${field}.effort`);
  const description = safeText(value.description, 2000, `${field}.description`);
  return {
    id: value.id,
    model: ref,
    effort: value.effort,
    description,
    rationale: safeText(value.rationale, AUTO_SETUP_LIMITS.roleRationale, `${field}.rationale`),
    effortRationale: safeText(
      value.effortRationale,
      AUTO_SETUP_LIMITS.effortRationale,
      `${field}.effortRationale`,
    ),
    evidenceModels: refList(value.evidenceModels, candidates, `${field}.evidenceModels`),
    uncertainty: safeText(value.uncertainty, AUTO_SETUP_LIMITS.caveat, `${field}.uncertainty`),
    ...(value.tradeoff === undefined
      ? {}
      : { tradeoff: safeText(value.tradeoff, AUTO_SETUP_LIMITS.caveat, `${field}.tradeoff`) }),
  };
}

function defaultRole(value: unknown, candidates: readonly AvailableModel[]): DefaultRecommendation {
  if (!isRecord(value)) throw new AutoSetupValidationError("expected_default", "default");
  rejectUnknown(
    value,
    [
      "model",
      "effort",
      "rationale",
      "effortRationale",
      "evidenceModels",
      "uncertainty",
      "tradeoff",
    ],
    "default",
  );
  const ref = model(value.model, "default.model");
  const candidate = candidates.find((item) => modelKey(item.ref) === modelKey(ref));
  if (!candidate) throw new AutoSetupValidationError("unselected_model", "default.model");
  if (!isEffort(value.effort) || !candidate.efforts.includes(value.effort))
    throw new AutoSetupValidationError("unsupported_effort", "default.effort");
  return {
    model: ref,
    effort: value.effort,
    rationale: safeText(value.rationale, AUTO_SETUP_LIMITS.roleRationale, "default.rationale"),
    effortRationale: safeText(
      value.effortRationale,
      AUTO_SETUP_LIMITS.effortRationale,
      "default.effortRationale",
    ),
    evidenceModels: refList(value.evidenceModels, candidates, "default.evidenceModels"),
    uncertainty: safeText(value.uncertainty, AUTO_SETUP_LIMITS.caveat, "default.uncertainty"),
    ...(value.tradeoff === undefined
      ? {}
      : { tradeoff: safeText(value.tradeoff, AUTO_SETUP_LIMITS.caveat, "default.tradeoff") }),
  };
}

/** Validates untrusted agent tool arguments. It never establishes source truth. */
export function validateProposal(
  value: unknown,
  candidates: readonly AvailableModel[],
): AutoSetupProposal {
  if (!isRecord(value)) throw new AutoSetupValidationError("expected_object");
  if (bytes(value) > AUTO_SETUP_LIMITS.toolArgumentsBytes)
    throw new AutoSetupValidationError("too_large");
  rejectUnknown(value, ["version", "summary", "assessments", "roles", "default"], "proposal");
  if (value.version !== 1) throw new AutoSetupValidationError("unsupported_version", "version");
  if (!Array.isArray(value.assessments) || value.assessments.length !== candidates.length)
    throw new AutoSetupValidationError("incomplete_assessments", "assessments");
  const assessments = value.assessments.map((item, index) =>
    assessment(item, candidates, `assessments[${index}]`),
  );
  const selected = new Set(candidates.map((candidate) => modelKey(candidate.ref)));
  if (
    new Set(assessments.map((item) => modelKey(item.model))).size !== assessments.length ||
    assessments.some((item) => !selected.has(modelKey(item.model)))
  )
    throw new AutoSetupValidationError("duplicate_or_missing_assessment", "assessments");
  const sourceCount = assessments.reduce((count, item) => count + item.sources.length, 0);
  if (sourceCount > AUTO_SETUP_LIMITS.sourcesTotal)
    throw new AutoSetupValidationError("too_many_sources", "assessments");
  if (!Array.isArray(value.roles) || value.roles.length > AUTO_SETUP_LIMITS.customRoles)
    throw new AutoSetupValidationError("too_many_roles", "roles");
  const roles = value.roles.map((item, index) => role(item, candidates, `roles[${index}]`));
  if (new Set(roles.map((item) => item.id)).size !== roles.length)
    throw new AutoSetupValidationError("duplicate_role", "roles");
  return {
    version: 1,
    summary: safeText(value.summary, AUTO_SETUP_LIMITS.reportSummary, "summary"),
    assessments,
    roles,
    ...(value.default === undefined ? {} : { default: defaultRole(value.default, candidates) }),
  };
}

export function validateEntrySize(value: unknown): void {
  if (bytes(value) > AUTO_SETUP_LIMITS.customEntryBytes)
    throw new AutoSetupValidationError("entry_too_large");
}

export function isSafeProposalId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{8,128}$/.test(value);
}
