import type { ExtensionAPI, ExtensionContext, InputEvent } from "@earendil-works/pi-coding-agent";
import type { ConfigStore } from "../config/store.js";
import { displayModel, modelKey, sameModel } from "../core/model-identity.js";
import { fallbackDecision, selectModelForTask, unavailable } from "../core/selection.js";
import type {
  Effort,
  ModelRef,
  ModelState,
  SelectionDecision,
  SelectionDependencies,
  SelectionRequest,
} from "../core/types.js";
import { withSelectionLoader } from "../ui/selection-loader.js";
import { currentState, piDependencies, readDefaults } from "./adapters.js";
import {
  DECISION_ENTRY,
  STATE_ENTRY,
  historyRequiresImages,
  restoreState,
} from "./session-state.js";
export class RolesController {
  active = false;
  mode: "auto" | "manual" = "auto";
  role?: string;
  lastDecision?: SelectionDecision;
  baseline: ModelState = { effort: "off" };
  private startup: ModelState = { effort: "off" };
  private defaultEffort: (model: ModelRef) => Effort = () => this.baseline.effort;
  private generation = 0;
  private sessionId?: string;
  private pending?: AbortController;
  private expected?: { model: ModelRef; effort?: Effort; phase: "model" | "effort" };
  private pinned?: ModelState;
  constructor(
    readonly pi: ExtensionAPI,
    readonly store: ConfigStore,
    readonly agentDir: string,
    readonly child: boolean,
    readonly startupChoice: boolean,
  ) {}
  async start(ctx: ExtensionContext, reason: string): Promise<void> {
    this.invalidate();
    this.active = !this.child && ctx.mode === "tui";
    if (!this.active) return;
    this.sessionId = ctx.sessionManager.getSessionId();
    const actual = currentState(ctx);
    const restored = restoreState(ctx, actual, actual);
    this.startup = restored?.baseline ?? actual;
    this.mode =
      this.startupChoice && reason !== "reload"
        ? "manual"
        : (restored?.mode ?? (!["startup", "new"].includes(reason) ? "manual" : "auto"));
    this.role = restored?.role;
    this.lastDecision = undefined;
    this.pinned = this.mode === "manual" ? actual : undefined;
    await this.reload(ctx);
    this.persist(ctx);
  }
  invalidate(): void {
    this.generation++;
    this.pending?.abort();
  }
  shutdown(ctx: ExtensionContext): void {
    this.active = false;
    this.invalidate();
    this.sessionId = undefined;
    ctx.ui.setStatus("model-roles", undefined);
  }
  async reload(ctx: ExtensionContext): Promise<void> {
    this.invalidate();
    await this.store.load(true);
    try {
      const defaults = readDefaults(ctx, this.agentDir, this.startup);
      this.baseline = defaults.baseline;
      this.defaultEffort = defaults.effort;
    } catch {
      this.baseline = this.startup;
      this.defaultEffort = () => this.startup.effort;
    }
    if (this.store.error)
      ctx.ui.notify(
        `Model roles: ${this.store.error.message}. Repair ${this.store.path}, then run Pi's /reload command.`,
        "warning",
      );
    this.status(ctx);
  }
  dependencies(ctx: ExtensionContext): SelectionDependencies | undefined {
    return this.store.snapshot
      ? piDependencies(ctx, this.store.snapshot.config, this.defaultEffort)
      : undefined;
  }
  private request(ctx: ExtensionContext, task: string, signal?: AbortSignal): SelectionRequest {
    return {
      task,
      current: currentState(ctx),
      baseline: this.baseline,
      signal,
      requiresImages: historyRequiresImages(ctx),
    };
  }
  async select(ctx: ExtensionContext, request: SelectionRequest): Promise<SelectionDecision> {
    const dependencies = this.dependencies(ctx);
    return dependencies
      ? selectModelForTask({ ...request, baseline: this.baseline }, dependencies)
      : unavailable("config_invalid");
  }
  private persist(ctx: ExtensionContext): void {
    if (!this.active) return;
    this.pi.appendEntry(STATE_ENTRY, {
      version: 1,
      mode: this.mode,
      baseline: this.startup,
      actual: currentState(ctx),
      role: this.role,
    });
    this.status(ctx);
  }
  get autoSelectorEnabled(): boolean {
    return this.mode === "auto" && Boolean(this.store.snapshot?.config.enabled);
  }
  status(ctx: ExtensionContext): void {
    if (!this.active) return;
    const actual = currentState(ctx);
    const selector = this.autoSelectorEnabled ? "enabled" : "disabled";
    ctx.ui.setStatus(
      "model-roles",
      `roles:auto-selector=${selector}${this.role ? ` role=${this.role}` : ""} ${displayModel(actual.model)}:${actual.effort}${this.lastDecision?.fallback ? ` [fallback:${this.lastDecision.reason}]` : ""}${this.store.error ? " [config warning]" : ""}`,
    );
  }
  private record(ctx: ExtensionContext, decision: SelectionDecision): void {
    this.lastDecision = decision;
    this.role =
      decision.status === "selected" || decision.status === "preserved" ? decision.role : undefined;
    this.pi.appendEntry(DECISION_ENTRY, decision);
    this.persist(ctx);
  }
  pause(ctx: ExtensionContext): void {
    this.invalidate();
    this.mode = "manual";
    this.role = undefined;
    this.pinned = currentState(ctx);
    this.persist(ctx);
  }
  disable(ctx: ExtensionContext): void {
    this.invalidate();
    this.mode = "manual";
    this.pinned = currentState(ctx);
    this.persist(ctx);
  }
  resume(ctx: ExtensionContext): void {
    this.invalidate();
    this.mode = "auto";
    this.pinned = undefined;
    this.role = undefined;
    this.persist(ctx);
  }
  externalChange(ctx: ExtensionContext, kind: "model" | "effort"): void {
    if (!this.active) return;
    const actual = currentState(ctx);
    if (this.expected && sameModel(actual.model, this.expected.model)) {
      if (
        kind === "model" ||
        this.expected.phase === "model" ||
        actual.effort === this.expected.effort
      )
        return;
    }
    this.pause(ctx);
  }
  tree(ctx: ExtensionContext): void {
    if (!this.active) return;
    this.invalidate();
    const actual = currentState(ctx);
    const state = restoreState(ctx, actual, this.startup);
    this.mode = state?.mode ?? "manual";
    this.role = state?.role;
    this.pinned = this.mode === "manual" ? actual : undefined;
    if (state) this.startup = state.baseline;
    this.status(ctx);
  }
  private async setPair(
    ctx: ExtensionContext,
    state: ModelState,
    valid: () => boolean = () => true,
  ): Promise<boolean> {
    if (!state.model || !valid()) return false;
    const model = ctx.modelRegistry.find(state.model.provider, state.model.id);
    if (!model) return false;
    this.expected = { model: state.model, phase: "model" };
    try {
      if (!sameModel(currentState(ctx).model, state.model) && !(await this.pi.setModel(model)))
        return false;
      // Authentication/model application can await. Never apply a stale role's effort afterward.
      if (!valid()) return false;
      this.expected = { model: state.model, effort: state.effort, phase: "effort" };
      if (currentState(ctx).effort !== state.effort) this.pi.setThinkingLevel(state.effort);
      return true;
    } finally {
      this.expected = undefined;
    }
  }
  private async apply(
    ctx: ExtensionContext,
    decision: SelectionDecision,
    request: SelectionRequest,
    token: number,
  ): Promise<SelectionDecision> {
    if (decision.status !== "selected") return decision;
    const session = this.sessionId;
    const dependencies = this.dependencies(ctx);
    if (!dependencies) return unavailable("config_invalid");
    if (token !== this.generation) return unavailable("stale", true);
    try {
      // Re-evaluate availability at the application boundary, without another classifier call.
      const check = await selectModelForTask(
        { ...request, explicitModel: decision.model, explicitEffort: decision.effort },
        dependencies,
      );
      if (check.status !== "preserved") throw new Error("model_unavailable");
      if (token !== this.generation) return unavailable("stale", true);
      if (
        !(await this.setPair(
          ctx,
          { model: decision.model, effort: decision.effort },
          () => token === this.generation,
        ))
      )
        throw new Error("apply_failed");
      if (token === this.generation) {
        const effort = currentState(ctx).effort;
        return {
          ...decision,
          effort,
          warnings: [
            ...new Set([
              ...decision.warnings,
              ...(effort !== decision.requestedEffort ? ["effort_clamped" as const] : []),
            ]),
          ],
        };
      }
    } catch {
      if (token === this.generation) {
        // A registry may still advertise a model whose setter just failed. Exclude every
        // failed identity so default -> baseline -> current is finite at application too.
        const failed = new Set([modelKey(decision.model)]);
        const remaining = {
          ...dependencies,
          models: () => dependencies.models().filter((model) => !failed.has(modelKey(model.ref))),
        };
        for (let attempt = 0; attempt < 3 && token === this.generation; attempt++) {
          const fallback = fallbackDecision(request, remaining, "apply_failed");
          if (fallback.status !== "selected") break;
          try {
            if (await this.setPair(ctx, fallback, () => token === this.generation)) {
              if (token === this.generation)
                return {
                  ...fallback,
                  effort: currentState(ctx).effort,
                  selector: decision.selector,
                };
            }
          } catch {
            /* Try only the remaining permitted fallback identities. */
          }
          failed.add(modelKey(fallback.model));
        }
        if (token === this.generation) return unavailable("apply_failed");
      }
    }
    // Pi setModel has no cancellation/CAS API. Repair an intervening manual choice after its await.
    if (this.active && this.sessionId === session && this.pinned) {
      try {
        const pin = this.pinned;
        const repairToken = this.generation;
        if (
          !(await this.setPair(
            ctx,
            pin,
            () => repairToken === this.generation && this.active && this.sessionId === session,
          ))
        )
          throw new Error("restore_failed");
      } catch {
        ctx.ui.notify(
          "Model roles: reselect your manual model after an interrupted switch.",
          "warning",
        );
      }
    }
    return unavailable("stale", true);
  }
  async input(
    event: InputEvent,
    ctx: ExtensionContext,
  ): Promise<{ action: "continue" | "handled" }> {
    if (
      !this.active ||
      ctx.mode !== "tui" ||
      event.source !== "interactive" ||
      event.streamingBehavior ||
      !ctx.isIdle() ||
      event.text.trimStart().startsWith("/")
    )
      return { action: "continue" };
    if (this.mode === "manual" || !this.store.snapshot?.config.enabled)
      return { action: "continue" };
    if (this.pending) {
      ctx.ui.notify(
        "Model role selection is already pending. Submit again when it finishes.",
        "warning",
      );
      return { action: "handled" };
    }
    const controller = new AbortController();
    this.pending = controller;
    const token = this.generation;
    const session = this.sessionId;
    try {
      const request = this.request(ctx, event.text, controller.signal);
      request.requiresImages ||= Boolean(event.images?.length);
      const work = () => this.select(ctx, request);
      const manyRoles = Object.keys(this.store.snapshot.config.roles).length > 1;
      let decision = manyRoles ? await withSelectionLoader(ctx, controller, work) : await work();
      if (token !== this.generation || controller.signal.aborted)
        decision = unavailable("cancelled", true);
      if (decision.status !== "cancelled")
        decision = await this.apply(ctx, decision, request, token);
      if (decision.status === "cancelled") {
        if (
          this.active &&
          this.sessionId === session &&
          session === ctx.sessionManager.getSessionId()
        ) {
          ctx.ui.setEditorText(event.text);
          if (event.images?.length)
            ctx.ui.notify(
              "Submission cancelled. Reattach images before resubmitting if needed.",
              "info",
            );
        }
        return { action: "handled" };
      }
      this.record(ctx, decision);
      return { action: "continue" };
    } catch {
      ctx.ui.notify("Model roles: routing failed; keeping Pi's current model.", "warning");
      return { action: "continue" };
    } finally {
      if (this.pending === controller) this.pending = undefined;
    }
  }
  async use(ctx: ExtensionContext, role: string): Promise<void> {
    this.invalidate();
    const token = this.generation;
    const request = { ...this.request(ctx, ""), requestedRole: role };
    const decision = await this.select(ctx, request);
    if (decision.status !== "selected" || decision.role !== role || decision.fallback) {
      ctx.ui.notify("Model roles: requested role is unavailable.", "warning");
      return;
    }
    const previous = currentState(ctx);
    const result = await this.apply(ctx, decision, request, token);
    if (result.status !== "selected" || result.role !== role || result.fallback) {
      await this.setPair(ctx, previous, () => token === this.generation);
      ctx.ui.notify(
        "Model roles: role could not be applied; the previous selection was restored.",
        "warning",
      );
      return;
    }
    if (this.mode === "manual") this.pinned = currentState(ctx);
    this.record(ctx, result);
  }
}
