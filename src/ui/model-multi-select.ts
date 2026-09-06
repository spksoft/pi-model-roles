import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";
import { displayModel } from "../core/model-identity.js";
import type { AvailableModel, ModelRef } from "../core/types.js";
import { AUTO_SETUP_LIMITS } from "../auto-setup/limits.js";

export class ModelMultiSelect implements Component {
  private cursor = 0;
  private readonly selected = new Set<number>();

  constructor(
    private readonly models: readonly AvailableModel[],
    private readonly tui: TUI,
    private readonly theme: ExtensionUIContext["theme"],
    private readonly done: (value: ModelRef[] | undefined) => void,
  ) {}

  render(width: number): string[] {
    const label = this.theme.bold(
      `Select models for Auto Setup (${this.selected.size}/${AUTO_SETUP_LIMITS.candidates})`,
    );
    const help = "↑/↓ or j/k move · Space toggle · Enter continue · Esc cancel";
    const maxLabel = Math.max(12, width - 4);
    const rows = this.models.map((model, index) => {
      const current = index === this.cursor;
      const checked = this.selected.has(index) ? "[x]" : "[ ]";
      const raw = `${checked} ${displayModel(model.ref)} · ${model.efforts.join(", ")}`;
      const text = raw.length > maxLabel ? `${raw.slice(0, Math.max(1, maxLabel - 1))}…` : raw;
      return current ? this.theme.fg("accent", `> ${text}`) : `  ${text}`;
    });
    return [
      label,
      help,
      this.selected.size === AUTO_SETUP_LIMITS.candidates ? "Maximum selected." : "",
      ...rows,
    ];
  }

  invalidate(): void {}

  handleInput(data: string): void {
    if (data === "\u001b") return this.done(undefined);
    if (data === "\r" || data === "\n") {
      if (this.selected.size) this.done(this.values());
      return;
    }
    if (data === "\u001b[A" || data === "k")
      this.cursor = (this.cursor + this.models.length - 1) % this.models.length;
    else if (data === "\u001b[B" || data === "j")
      this.cursor = (this.cursor + 1) % this.models.length;
    else if (data === " ") {
      if (this.selected.has(this.cursor)) this.selected.delete(this.cursor);
      else if (this.selected.size < AUTO_SETUP_LIMITS.candidates) this.selected.add(this.cursor);
    }
    this.tui.requestRender();
  }

  values(): ModelRef[] {
    return [...this.selected]
      .sort((left, right) => left - right)
      .map((index) => this.models[index])
      .filter((model): model is AvailableModel => model !== undefined)
      .map((model) => ({ ...model.ref }));
  }
}

export async function selectModels(
  ui: ExtensionUIContext,
  models: readonly AvailableModel[],
): Promise<ModelRef[] | undefined> {
  if (!models.length) return undefined;
  return ui.custom<ModelRef[] | undefined>(
    (tui, theme, _keybindings, done) => new ModelMultiSelect(models, tui, theme, done),
  );
}
