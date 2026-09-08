import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import {
  CONFIG_DIR_NAME,
  SettingsManager,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { isEffort, sameModel } from "../core/model-identity.js";
import type {
  AvailableModel,
  ClassifierInput,
  ClassifierOutput,
  Effort,
  ModelRef,
  ModelState,
  RoleConfig,
  SelectionDependencies,
} from "../core/types.js";
export function readDefaults(
  ctx: ExtensionContext,
  agentDir: string,
  startup: ModelState,
): { baseline: ModelState; effort: (model: ModelRef) => Effort } {
  // Public storage seam intentionally discards writes, including any future load-time migration.
  const settings = SettingsManager.fromStorage(
    {
      withLock(scope, fn) {
        const path =
          scope === "global"
            ? join(agentDir, "settings.json")
            : join(ctx.cwd, CONFIG_DIR_NAME, "settings.json");
        let text: string | undefined;
        try {
          text = readFileSync(path, "utf8");
        } catch {
          /* Missing/unreadable defaults use the startup pair. */
        }
        fn(text);
      },
    },
    { projectTrusted: ctx.isProjectTrusted() },
  );
  const provider = settings.getDefaultProvider();
  const id = settings.getDefaultModel();
  const configured = provider && id ? ctx.modelRegistry.find(provider, id) : undefined;
  const model = configured ? { provider: configured.provider, id: configured.id } : startup.model;
  const effort = (ref: ModelRef): Effort => {
    const value =
      settings.getModelThinkingLevel(ref.provider, ref.id) ??
      settings.getDefaultThinkingLevel() ??
      startup.effort;
    return isEffort(value) ? value : startup.effort;
  };
  return { baseline: { model, effort: model ? effort(model) : startup.effort }, effort };
}
export function availableModels(ctx: ExtensionContext): AvailableModel[] {
  return ctx.modelRegistry
    .getAvailable()
    .filter(
      (model) =>
        !ctx.scopedModels.length ||
        ctx.scopedModels.some((item) =>
          sameModel({ provider: item.model.provider, id: item.model.id }, model),
        ),
    )
    .map((model) => ({
      ref: { provider: model.provider, id: model.id },
      efforts: (() => {
        const pin = ctx.scopedModels.find((item) => sameModel(item.model, model))?.thinkingLevel;
        const supported = getSupportedThinkingLevels(model);
        return pin === undefined ? supported : supported.filter((effort) => effort === pin);
      })(),
      images: model.input.includes("image"),
      contextWindow: model.contextWindow,
    }));
}
export function requiredSelectorEffort(ctx: ExtensionContext, ref: ModelRef): Effort | undefined {
  return ctx.scopedModels.find((item) => sameModel(item.model, ref))?.thinkingLevel;
}

export function selectorEffortAllowed(
  ctx: ExtensionContext,
  ref: ModelRef,
  effort: Effort | undefined,
): boolean {
  const required = requiredSelectorEffort(ctx, ref);
  return (
    (required === undefined || effort === required) &&
    (effort === undefined || selectorEfforts(ctx, ref).includes(effort))
  );
}

/** Pi 0.85.1 complete() accepts API-specific options, not simple-stream reasoning.
 * Only OpenAI Responses forwarding is verified here; other APIs may omit effort. */
export function selectorEfforts(ctx: ExtensionContext, ref: ModelRef): readonly Effort[] {
  const model = ctx.modelRegistry.find(ref.provider, ref.id);
  const configured = ctx.modelRegistry.getRegisteredProviderConfig(ref.provider);
  // Configured streamSimple replaces complete() transport and can overwrite reasoningEffort.
  return model?.api === "openai-responses" &&
    !(configured?.streamSimple && configured.api === model.api) &&
    !Object.hasOwn(model.samplingParams ?? {}, "reasoning")
    ? (availableModels(ctx)
        .find((item) => sameModel(item.ref, ref))
        ?.efforts.filter(
          (effort) => effort !== "off" || !model.reasoning || model.provider !== "github-copilot",
        ) ?? [])
    : [];
}
export async function completeClassifier(
  ctx: ExtensionContext,
  input: ClassifierInput,
): Promise<ClassifierOutput> {
  const model = ctx.modelRegistry.find(input.model.provider, input.model.id);
  if (!model) throw new Error("selector_unavailable");
  if (!selectorEffortAllowed(ctx, input.model, input.effort))
    throw new Error("selector_effort_unsupported");
  const response = await ctx.modelRegistry.complete(
    model,
    {
      systemPrompt: input.systemPrompt,
      messages: [
        { role: "user", content: [{ type: "text", text: input.text }], timestamp: Date.now() },
      ],
    },
    {
      signal: input.signal,
      maxTokens: input.maxTokens,
      ...(input.effort === undefined || input.effort === "off"
        ? {}
        : { reasoningEffort: input.effort }),
    },
  );
  if (
    response.stopReason !== "stop" ||
    response.content.some((block) => block.type !== "text" && block.type !== "thinking")
  )
    throw new Error("selector_failed");
  const usage = response.usage;
  const numeric = [usage.input, usage.output, usage.totalTokens, usage.cost.total];
  return {
    text: response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join(""),
    ...(numeric.every((value) => Number.isFinite(value) && value >= 0)
      ? {
          usage: {
            input: usage.input,
            output: usage.output,
            totalTokens: usage.totalTokens,
            cost: usage.cost.total,
          },
        }
      : {}),
  };
}
export function piDependencies(
  ctx: ExtensionContext,
  config: RoleConfig,
  effort: (ref: ModelRef) => Effort,
): SelectionDependencies {
  return {
    config,
    models: () => availableModels(ctx),
    classify: (input) => completeClassifier(ctx, input),
    defaultEffort: effort,
    supportsSelectorEffort: (ref, level) => selectorEfforts(ctx, ref).includes(level),
    requiredSelectorEffort: (ref) => requiredSelectorEffort(ctx, ref),
  };
}
export function currentState(ctx: ExtensionContext): ModelState {
  return {
    model: ctx.model ? { provider: ctx.model.provider, id: ctx.model.id } : undefined,
    effort: ctx.thinkingLevel ?? "off",
  };
}
