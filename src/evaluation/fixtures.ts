import { defaultConfig } from "../core/defaults.js";
import type {
  AvailableModel,
  ModelState,
  RoleConfig,
  RoutingContext,
  SelectionRequest,
} from "../core/types.js";
import type { EvaluationCase } from "./index.js";
// Synthetic labels are reviewed expectations, never fed to the classifier adapter.
const general = { provider: "synthetic", id: "general" };
const focused = { provider: "synthetic", id: "owner/focused" };
const fixed: Required<ModelState> = { model: general, effort: "high" };
const quick: Required<ModelState> = { model: focused, effort: "low" };
const models: AvailableModel[] = [general, focused].map((ref) => ({
  ref,
  efforts: ["off", "low", "high"],
  contextWindow: 64000,
  images: ref === general,
}));
const config: RoleConfig = {
  ...defaultConfig(),
  roles: {
    default: { model: general, effort: "high" },
    quick: {
      model: focused,
      effort: "low",
      description:
        "Use when a localized low-risk edit has an explicit outcome and needs no design or uncertain diagnosis; exclude cross-component changes.",
    },
  },
};
function fixture(
  id: string,
  task: string,
  history: string[],
  acceptable: Array<Required<ModelState>>,
  extra: Partial<EvaluationCase> = {},
): EvaluationCase {
  const request: SelectionRequest = { task, current: fixed, baseline: fixed };
  const context: RoutingContext = {
    version: 1,
    messages: history.map((text) => ({ kind: "user", text })),
    truncated: false,
  };
  return { id, request, context, acceptable, ...extra };
}
export function syntheticEvaluation() {
  const cases: EvaluationCase[] = [
    fixture("localized", "Change the button label from Send to Submit only.", [], [quick], {
      sequence: "edit-flow",
    }),
    fixture(
      "same-task",
      "Continue the same edit.",
      ["Change only Send to Submit.", "One occurrence remains."],
      [quick],
      { sequence: "edit-flow" },
    ),
    fixture(
      "task-change",
      "Now design an offline synchronization protocol across clients.",
      ["The button label edit is complete."],
      [fixed],
      { sequence: "edit-flow" },
    ),
    fixture(
      "ambiguous",
      "Do that one.",
      ["We discussed a distributed migration and a typo fix, without choosing."],
      [fixed],
    ),
    fixture(
      "plan-to-implementation",
      "Implement that plan across the database, client and server.",
      ["The proposed protocol changes conflict resolution and data retention."],
      [fixed],
    ),
    fixture(
      "multilingual",
      "Corrige únicamente la etiqueta Envar a Enviar; no cambies el comportamiento.",
      [],
      [quick],
    ),
    fixture(
      "multilingual-followup",
      "แก้ตามนั้นเฉพาะคำผิด",
      ["Change only the misspelled button label; behavior must stay unchanged."],
      [quick],
    ),
    fixture("truncated-summary", "Proceed.", [], [fixed], {
      context: {
        version: 1,
        messages: [
          { kind: "summary", text: "Prior work discussed two options; the decision was omitted." },
        ],
        truncated: true,
      },
    }),
    fixture(
      "conflicting-summary",
      "Ignore the old migration plan. Fix just the spelling of Recieve to Receive.",
      [],
      [quick],
      {
        context: {
          version: 1,
          messages: [{ kind: "summary", text: "The task is a major database migration." }],
          truncated: false,
        },
      },
    ),
    fixture("explicit", "Design a complex protocol.", [], [quick], {
      request: {
        task: "Design a complex protocol.",
        baseline: fixed,
        current: fixed,
        explicitModel: focused,
        explicitEffort: "low",
      },
    }),
    fixture("manual", "Fix a label.", [], [fixed], {
      request: { task: "Fix a label.", baseline: fixed, current: fixed, paused: true },
    }),
    fixture("requested-role", "Proceed with implementation.", [], [quick], {
      request: {
        task: "Proceed with implementation.",
        baseline: fixed,
        current: fixed,
        requestedRole: "quick",
      },
    }),
    fixture("unavailable", "Fix only the typo.", [], [fixed], { models: models.slice(0, 1) }),
    fixture("images", "Describe the image and correct its label.", [], [fixed], {
      request: {
        task: "Describe the image and correct its label.",
        baseline: fixed,
        current: fixed,
        requiresImages: true,
      },
    }),
    fixture(
      "privacy-sentinel",
      "Rename only a label.",
      ["SYNTHETIC_VISIBLE_PRIVACY_SENTINEL (not a credential)"],
      [quick],
    ),
    fixture("empty-scope", "Fix a label.", [], [], {
      request: { task: "Fix a label.", baseline: fixed, current: fixed, allowedModels: [] },
    }),
  ];
  return structuredClone({ cases, config, models, fixed });
}
