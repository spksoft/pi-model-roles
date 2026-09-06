import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import { fuzzyFilter, Input, type Component, type TUI } from "@earendil-works/pi-tui";
import { AUTO_SETUP_LIMITS } from "../auto-setup/limits.js";
import { displayModel } from "../core/model-identity.js";
import type { AvailableModel, ModelRef } from "../core/types.js";

const PAGE_SIZE = 8;

interface ModelOption {
  index: number;
  model: AvailableModel;
}

export class ModelMultiSelect implements Component {
  private cursor = 0;
  private readonly selected = new Set<number>();
  private readonly options: ModelOption[];
  private filtered: ModelOption[];
  private searching = false;
  private readonly searchInput = new Input({
    prompt: "Search: ",
    placeholder: "type to fuzzy-filter models",
  });

  constructor(
    private readonly models: readonly AvailableModel[],
    private readonly tui: TUI,
    private readonly theme: ExtensionUIContext["theme"],
    private readonly done: (value: ModelRef[] | undefined) => void,
  ) {
    this.options = models.map((model, index) => ({ index, model }));
    this.filtered = this.options;
  }

  render(width: number): string[] {
    const label = this.theme.bold(
      `Select models for Auto Setup (${this.selected.size}/${AUTO_SETUP_LIMITS.candidates})`,
    );
    const help = this.searching
      ? "Type to fuzzy-filter · ↑/↓ move · Esc clear search · Enter continue"
      : "↑/↓ or j/k move · Space toggle · / search · PgUp/PgDn page · Enter continue · Esc cancel";
    const maxLabel = Math.max(12, width - 4);
    const page = Math.floor(this.cursor / PAGE_SIZE);
    const pageCount = Math.max(1, Math.ceil(this.filtered.length / PAGE_SIZE));
    const start = page * PAGE_SIZE;
    const visible = this.filtered.slice(start, start + PAGE_SIZE);
    const rows = visible.map((option, offset) => {
      const index = start + offset;
      const current = index === this.cursor;
      const checked = this.selected.has(option.index) ? "[x]" : "[ ]";
      const raw = `${checked} ${displayModel(option.model.ref)} · ${option.model.efforts.join(", ")}`;
      const text = raw.length > maxLabel ? `${raw.slice(0, Math.max(1, maxLabel - 1))}…` : raw;
      return current ? this.theme.fg("accent", `> ${text}`) : `  ${text}`;
    });
    const range = this.filtered.length ? `${start + 1}–${start + visible.length}` : "0";
    const pageInfo = `Page ${page + 1}/${pageCount} · ${range} of ${this.filtered.length}`;
    const search = this.searching ? this.searchInput.render(width) : [];

    return [
      label,
      help,
      ...search,
      this.selected.size === AUTO_SETUP_LIMITS.candidates ? "Maximum selected." : "",
      pageInfo,
      ...(rows.length ? rows : ["  No matching models."]),
    ];
  }

  invalidate(): void {
    this.searchInput.invalidate();
  }

  handleInput(data: string): void {
    if (data === "\u001b") {
      if (this.searching) return this.clearSearch();
      return this.done(undefined);
    }
    if (data === "/" || data === "\u0006") {
      this.searching = true;
      this.searchInput.focused = true;
      return this.tui.requestRender();
    }
    if (data === "\r" || data === "\n") {
      if (this.selected.size) this.done(this.values());
      return;
    }
    if (data === " ") {
      this.toggle();
      return this.tui.requestRender();
    }
    if (this.searching) {
      if (this.isMoveUp(data)) this.move(-1);
      else if (this.isMoveDown(data)) this.move(1);
      else if (this.isPageUp(data)) this.move(-PAGE_SIZE);
      else if (this.isPageDown(data)) this.move(PAGE_SIZE);
      else {
        this.searchInput.handleInput(data);
        this.filter();
      }
    } else if (this.isMoveUp(data)) this.move(-1);
    else if (this.isMoveDown(data)) this.move(1);
    else if (this.isPageUp(data)) this.move(-PAGE_SIZE);
    else if (this.isPageDown(data)) this.move(PAGE_SIZE);
    else if (data === " ") this.toggle();
    this.tui.requestRender();
  }

  values(): ModelRef[] {
    return [...this.selected]
      .sort((left, right) => left - right)
      .map((index) => this.models[index])
      .filter((model): model is AvailableModel => model !== undefined)
      .map((model) => ({ ...model.ref }));
  }

  private isMoveUp(data: string): boolean {
    return data === "\u001b[A" || data === "k";
  }

  private isMoveDown(data: string): boolean {
    return data === "\u001b[B" || data === "j";
  }

  private isPageUp(data: string): boolean {
    return data === "\u001b[5~" || data === "H";
  }

  private isPageDown(data: string): boolean {
    return data === "\u001b[6~" || data === "L";
  }

  private move(offset: number): void {
    if (!this.filtered.length) return;
    this.cursor = Math.max(0, Math.min(this.filtered.length - 1, this.cursor + offset));
  }

  private toggle(): void {
    const option = this.filtered[this.cursor];
    if (!option) return;
    if (this.selected.has(option.index)) this.selected.delete(option.index);
    else if (this.selected.size < AUTO_SETUP_LIMITS.candidates) this.selected.add(option.index);
  }

  private filter(): void {
    const query = this.searchInput.getValue();
    this.filtered = query
      ? fuzzyFilter(
          this.options,
          query,
          (option) => `${displayModel(option.model.ref)} ${option.model.efforts.join(" ")}`,
        )
      : this.options;
    this.cursor = 0;
  }

  private clearSearch(): void {
    this.searching = false;
    this.searchInput.focused = false;
    this.searchInput.setValue("");
    this.filtered = this.options;
    this.cursor = 0;
    this.tui.requestRender();
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
