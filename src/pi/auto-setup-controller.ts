import { randomUUID } from "node:crypto";
import type { ExtensionAPI, ExtensionContext, InputEvent } from "@earendil-works/pi-coding-agent";
import type { ConfigStore } from "../config/store.js";
import { sameModel } from "../core/model-identity.js";
import type { AvailableModel, ModelRef, ModelState } from "../core/types.js";
import { buildRefinementPrompt, buildResearchPrompt } from "../auto-setup/prompt.js";
import type { AutoSetupDraft, AutoSetupProposal } from "../auto-setup/types.js";
import { AutoSetupValidationError, validateProposal } from "../auto-setup/validation.js";
import { currentState } from "./adapters.js";
import { appendAutoSetupEntry, restoreAutoSetupDraft } from "./auto-setup-state.js";

export const AUTO_SETUP_TOOL = "model_roles_submit_auto_setup_proposal";

type Phase = "dispatching" | "running" | "settling";

interface RuntimeRequest {
  requestId: string;
  generation: number;
  sessionId: string;
  researchState: ModelState;
  candidates: AvailableModel[];
  baseRevision: string;
  phase: Phase;
  ownsTurn: boolean;
  previousDraft?: AutoSetupDraft;
  accepted?: AutoSetupDraft;
}

export type AutoSetupStatus =
  | "idle"
  | "running"
  | "settling"
  | "ready"
  | "cancelled"
  | "invalid_history";

function sameState(left: ModelState, right: ModelState): boolean {
  return sameModel(left.model, right.model) && left.effort === right.effort;
}

function cloneCandidates(candidates: readonly AvailableModel[]): AvailableModel[] {
  return candidates.map((candidate) => ({
    ref: { ...candidate.ref },
    efforts: [...candidate.efforts],
    images: candidate.images,
    contextWindow: candidate.contextWindow,
  }));
}

export class AutoSetupController {
  private active = false;
  private generation = 0;
  private runtime?: RuntimeRequest;
  private draft?: AutoSetupDraft;
  private status: AutoSetupStatus = "idle";

  constructor(
    private readonly pi: ExtensionAPI,
    private readonly store: ConfigStore,
    private readonly isPrimaryActive: () => boolean,
  ) {}

  get currentDraft(): AutoSetupDraft | undefined {
    return this.draft ? structuredClone(this.draft) : undefined;
  }

  get currentStatus(): AutoSetupStatus {
    return this.status;
  }

  start(ctx: ExtensionContext): void {
    this.active = this.isPrimaryActive();
    this.runtime = undefined;
    this.removeTool();
    if (!this.active) return;
    const restored = restoreAutoSetupDraft(ctx);
    this.draft = restored.state === "ready" ? restored.draft : undefined;
    this.status =
      restored.state === "ready"
        ? "ready"
        : restored.state === "invalid"
          ? "invalid_history"
          : restored.state === "cancelled"
            ? "cancelled"
            : "idle";
  }

  shutdown(): void {
    this.active = false;
    this.generation++;
    this.runtime = undefined;
    this.removeTool();
  }

  tree(ctx: ExtensionContext): void {
    this.stopLive(ctx, false, false);
    this.start(ctx);
  }

  modelChanged(ctx: ExtensionContext): void {
    if (!this.runtime) return;
    const previousDraft = this.runtime.previousDraft;
    this.stopLive(ctx, !previousDraft, false);
    this.draft = previousDraft;
    this.status = previousDraft ? "ready" : "cancelled";
  }

  ordinaryInput(event: InputEvent, ctx: ExtensionContext): void {
    if (
      event.source === "interactive" &&
      !event.streamingBehavior &&
      !event.text.trimStart().startsWith("/") &&
      this.runtime
    )
      this.stopLive(ctx, false, false);
  }

  beginResearch(ctx: ExtensionContext, candidates: readonly AvailableModel[]): boolean {
    return this.begin(ctx, cloneCandidates(candidates), undefined, undefined);
  }

  beginRefinement(ctx: ExtensionContext, question: string): boolean {
    const draft = this.draft;
    if (!draft) {
      ctx.ui.notify("Auto Setup has no reviewable draft. Start a new research pass.", "warning");
      return false;
    }
    return this.begin(ctx, cloneCandidates(draft.candidates), draft, question);
  }

  private begin(
    ctx: ExtensionContext,
    candidates: AvailableModel[],
    previousDraft: AutoSetupDraft | undefined,
    question: string | undefined,
  ): boolean {
    if (!this.active || !this.isPrimaryActive() || ctx.mode !== "tui") return false;
    if (this.runtime) {
      ctx.ui.notify(
        "Auto Setup research is already running. Cancel it or wait for it to settle.",
        "warning",
      );
      return false;
    }
    if (!candidates.length || candidates.length > 8) {
      ctx.ui.notify("Choose between 1 and 8 available models.", "warning");
      return false;
    }
    if (this.store.error || !this.store.snapshot) {
      ctx.ui.notify(
        "Auto Setup needs a valid saved role configuration. Repair or reload it first.",
        "warning",
      );
      return false;
    }
    const state = currentState(ctx);
    if (!state.model) {
      ctx.ui.notify("Choose an active Pi model before starting Auto Setup.", "warning");
      return false;
    }
    const runtime: RuntimeRequest = {
      requestId: randomUUID(),
      generation: ++this.generation,
      sessionId: ctx.sessionManager.getSessionId(),
      researchState: state,
      candidates,
      baseRevision: this.store.snapshot.revision,
      phase: "dispatching",
      ownsTurn: false,
      previousDraft,
    };
    let prompt: string;
    try {
      prompt = previousDraft
        ? buildRefinementPrompt({
            requestId: runtime.requestId,
            generation: runtime.generation,
            draft: previousDraft,
            question: question ?? "",
          })
        : buildResearchPrompt({
            requestId: runtime.requestId,
            generation: runtime.generation,
            candidates,
          });
    } catch (error) {
      ctx.ui.notify(
        error instanceof Error && error.message === "too_large"
          ? "Auto Setup discussion is too large to send safely. Start a new pass or shorten the question."
          : "Auto Setup could not prepare the research request.",
        "warning",
      );
      return false;
    }
    this.runtime = runtime;
    this.status = "running";
    this.activateTool();
    try {
      this.pi.sendUserMessage(prompt);
      return true;
    } catch {
      this.stopLive(ctx, previousDraft === undefined, false);
      ctx.ui.notify("Auto Setup could not start the normal agent research turn.", "warning");
      return false;
    }
  }

  agentStarted(ctx: ExtensionContext): void {
    const runtime = this.runtime;
    if (!runtime || runtime.phase !== "dispatching") return;
    if (runtime.sessionId !== ctx.sessionManager.getSessionId()) return;
    runtime.phase = "running";
    runtime.ownsTurn = true;
  }

  agentSettled(ctx: ExtensionContext): void {
    const runtime = this.runtime;
    if (!runtime || runtime.sessionId !== ctx.sessionManager.getSessionId() || !ctx.isIdle())
      return;
    this.removeTool();
    this.runtime = undefined;
    if (runtime.phase === "settling" && runtime.accepted) {
      this.draft = runtime.accepted;
      this.status = "ready";
      try {
        appendAutoSetupEntry(this.pi.appendEntry.bind(this.pi), {
          version: 1,
          requestId: runtime.requestId,
          state: "ready",
          draft: runtime.accepted,
        });
        ctx.ui.notify("Auto Setup proposal is ready. Run /model-roles auto-setup review.", "info");
      } catch {
        ctx.ui.notify(
          "Auto Setup proposal is ready for this session, but its review marker could not be saved. Do not rely on it after reload.",
          "warning",
        );
      }
      return;
    }
    this.draft = runtime.previousDraft;
    this.status = this.draft ? "ready" : "idle";
    ctx.ui.notify(
      this.draft
        ? "Auto Setup settled without a valid revision. The previous proposal remains available for review."
        : "Auto Setup settled without a valid structured proposal. Start again or continue with manual role editing.",
      "warning",
    );
  }

  submit(
    ctx: ExtensionContext,
    input: { requestId: string; generation: number; proposal: unknown },
  ): { ok: true } | { ok: false; reason: string } {
    const runtime = this.runtime;
    if (
      !runtime ||
      (runtime.phase !== "dispatching" && runtime.phase !== "running") ||
      runtime.requestId !== input.requestId ||
      runtime.generation !== input.generation ||
      runtime.sessionId !== ctx.sessionManager.getSessionId() ||
      !sameState(currentState(ctx), runtime.researchState)
    )
      return { ok: false, reason: "This Auto Setup proposal is no longer active." };
    try {
      const proposal = validateProposal(input.proposal, runtime.candidates);
      const accepted: AutoSetupDraft = {
        version: 1,
        requestId: runtime.requestId,
        baseRevision: runtime.baseRevision,
        candidates: cloneCandidates(runtime.candidates),
        researchModel: { ...runtime.researchState.model! },
        receivedAt: new Date().toISOString(),
        proposal,
      };
      runtime.accepted = accepted;
      runtime.phase = "settling";
      this.removeTool();
      this.status = "settling";
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        reason:
          error instanceof AutoSetupValidationError
            ? `Proposal was rejected (${error.code}).`
            : "Proposal was rejected.",
      };
    }
  }

  cancel(ctx: ExtensionContext): boolean {
    const runtime = this.runtime;
    const hadDraft = Boolean(this.draft);
    if (!runtime && !hadDraft) {
      ctx.ui.notify("Auto Setup has no active research or pending draft.", "info");
      return false;
    }
    const shouldAbort = Boolean(runtime?.ownsTurn && !ctx.isIdle());
    this.stopLive(ctx, false, shouldAbort);
    this.draft = undefined;
    this.status = "cancelled";
    if (runtime) {
      try {
        appendAutoSetupEntry(this.pi.appendEntry.bind(this.pi), {
          version: 1,
          requestId: runtime.requestId,
          state: "cancelled",
        });
      } catch {
        ctx.ui.notify(
          "Auto Setup was cancelled, but its session cancellation marker could not be saved.",
          "warning",
        );
      }
    }
    if (!shouldAbort && runtime && !ctx.isIdle())
      ctx.ui.notify(
        "Auto Setup was cancelled. The current agent run was not proven to be owned; press Escape to stop it if needed.",
        "info",
      );
    else ctx.ui.notify("Auto Setup cancelled. No Auto Setup configuration was saved.", "info");
    return true;
  }

  markApplied(ctx: ExtensionContext, draft: AutoSetupDraft): void {
    this.draft = undefined;
    this.status = "idle";
    try {
      appendAutoSetupEntry(this.pi.appendEntry.bind(this.pi), {
        version: 1,
        requestId: draft.requestId,
        state: "applied",
      });
    } catch {
      ctx.ui.notify(
        "Model roles were saved, but Auto Setup could not record its applied marker. Do not apply this proposal again without reloading and reviewing.",
        "warning",
      );
    }
  }

  private stopLive(ctx: ExtensionContext, appendCancelled: boolean, abort: boolean): void {
    const runtime = this.runtime;
    this.generation++;
    this.runtime = undefined;
    this.removeTool();
    if (abort) ctx.abort();
    if (runtime && appendCancelled) {
      try {
        appendAutoSetupEntry(this.pi.appendEntry.bind(this.pi), {
          version: 1,
          requestId: runtime.requestId,
          state: "cancelled",
        });
      } catch {
        /* The live authority is already revoked even if history cannot be recorded. */
      }
    }
  }

  private activateTool(): void {
    const active = this.pi.getActiveTools();
    if (!active.includes(AUTO_SETUP_TOOL)) this.pi.setActiveTools([...active, AUTO_SETUP_TOOL]);
  }

  private removeTool(): void {
    const active = this.pi.getActiveTools();
    if (active.includes(AUTO_SETUP_TOOL))
      this.pi.setActiveTools(active.filter((name) => name !== AUTO_SETUP_TOOL));
  }
}
