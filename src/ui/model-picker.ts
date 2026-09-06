import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import {
  fuzzyFilter,
  Input,
  KeybindingsManager,
  matchesKey,
  truncateToWidth,
  TUI_KEYBINDINGS,
  type Component,
  type Focusable,
  type TUI,
} from "@earendil-works/pi-tui";
import { displayModel, sameModel } from "../core/model-identity.js";
import type { AvailableModel, ModelRef } from "../core/types.js";

export type ModelChoice = ModelRef | "inherit";

interface PickerOption {
  value: ModelChoice;
  label: string;
  search: string;
}

interface ModelPickerOptions {
  title: string;
  allowInherit?: boolean;
  current?: ModelChoice;
  /** Omit for single selection; otherwise bound the number of checked models. */
  multiple?: number;
}

/** Shared cached-catalog picker for every model-selection entry point. */
export class ModelPicker implements Component, Focusable {
  private cursor = 0;
  private readonly selected = new Set<PickerOption>();
  private readonly options: PickerOption[];
  private filtered: PickerOption[];
  private readonly searchInput = new Input({
    prompt: "> ",
    placeholder: "Type to search models…",
  });

  get focused(): boolean {
    return this.searchInput.focused;
  }

  set focused(value: boolean) {
    this.searchInput.focused = value;
  }

  constructor(
    models: readonly AvailableModel[],
    private readonly settings: ModelPickerOptions,
    private readonly tui: TUI,
    private readonly theme: ExtensionUIContext["theme"],
    private readonly done: (value: ModelChoice[] | undefined) => void,
    private readonly keybindings = new KeybindingsManager(TUI_KEYBINDINGS),
  ) {
    this.options = models.map(({ ref }) => ({
      value: { ...ref },
      label: `${ref.id} [${ref.provider}]`,
      search: displayModel(ref),
    }));
    if (settings.allowInherit)
      this.options.unshift({
        value: "inherit",
        label: "Use Pi default model",
        search: "Use Pi default model inherit",
      });
    this.filtered = this.options;
    this.cursor = Math.max(
      0,
      this.options.findIndex(({ value }) =>
        value === "inherit" || settings.current === "inherit"
          ? value === settings.current
          : sameModel(value, settings.current),
      ),
    );
  }

  private layout() {
    // Leave room for the host's editor/footer chrome. Recompute on resize and input.
    const height = Math.max(1, (this.tui.terminal?.rows ?? 24) - 4);
    const title = height >= 5;
    const search = height >= 3;
    const help = height >= 8;
    const footer = height >= 2;
    const overhead = Number(title) + Number(search) + Number(footer) + (help ? 2 : 0);
    return { title, search, help, footer, pageSize: Math.min(8, height - overhead) };
  }

  render(width: number): string[] {
    if (width <= 0) return [];
    const layout = this.layout();
    const page = Math.floor(this.cursor / layout.pageSize);
    const start = page * layout.pageSize;
    const visible = this.filtered.slice(start, start + layout.pageSize);
    const count = this.settings.multiple
      ? ` · ${this.selected.size}/${this.settings.multiple} selected${this.selected.size === this.settings.multiple ? " (maximum)" : ""}`
      : "";
    const rows = visible.map((option, offset) => {
      const current = start + offset === this.cursor;
      const checked = this.settings.multiple ? `${this.selected.has(option) ? "[x]" : "[ ]"} ` : "";
      // Catalog labels are plain text; never interpret provider-supplied controls.
      const label = option.label.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ");
      const line = `${current ? "> " : "  "}${checked}${label}`;
      return current ? this.theme.fg("accent", line) : line;
    });
    const keys = (id: Parameters<KeybindingsManager["getKeys"]>[0]) =>
      this.keybindings.getKeys(id).join("/");
    const navigation = `${keys("tui.select.up")}/${keys("tui.select.down")} move · ${keys("tui.select.pageUp")}/${keys("tui.select.pageDown")} page`;
    const actions = `${this.settings.multiple ? "Space/Tab toggle · " : ""}${keys("tui.select.confirm")} ${this.settings.multiple ? "done" : "select"} · ${keys("tui.select.cancel")} cancel`;
    return [
      ...(layout.title ? [this.theme.bold(this.settings.title)] : []),
      ...(layout.search ? this.searchInput.render(width) : []),
      ...(rows.length ? rows : ["No matching models."]),
      ...(layout.footer
        ? [
            `Page ${page + 1}/${Math.max(1, Math.ceil(this.filtered.length / layout.pageSize))} · ${this.filtered.length} matches${count}`,
          ]
        : []),
      ...(layout.help ? [navigation, actions] : []),
    ].map((line) => truncateToWidth(line, width, width < 3 ? "" : "…"));
  }

  invalidate(): void {
    this.searchInput.invalidate();
  }

  handleInput(data: string): void {
    const kb = this.keybindings;
    if (kb.matches(data, "tui.select.cancel")) return this.done(undefined);
    if (kb.matches(data, "tui.select.confirm")) {
      const option = this.filtered[this.cursor];
      if (this.settings.multiple) {
        if (this.selected.size) this.done(this.values());
      } else if (option) this.done([this.clone(option.value)]);
      return;
    }
    if (kb.matches(data, "tui.select.up")) this.move(-1);
    else if (kb.matches(data, "tui.select.down")) this.move(1);
    else if (kb.matches(data, "tui.select.pageUp")) this.movePage(-1);
    else if (kb.matches(data, "tui.select.pageDown")) this.movePage(1);
    else if (
      this.settings.multiple &&
      (matchesKey(data, "space") || kb.matches(data, "tui.input.tab"))
    ) {
      const option = this.filtered[this.cursor];
      if (option && !this.selected.delete(option) && this.selected.size < this.settings.multiple)
        this.selected.add(option);
    } else {
      const before = this.searchInput.getValue();
      if (matchesKey(data, "ctrl+u")) this.searchInput.setValue("");
      else this.searchInput.handleInput(data);
      const query = this.searchInput.getValue();
      if (before !== query) {
        this.filtered = fuzzyFilter(this.options, query, (option) => option.search);
        this.cursor = 0;
      }
    }
    this.tui.requestRender();
  }

  values(): ModelChoice[] {
    // Preserve original catalog order and identity across filtering and pagination.
    return this.options
      .filter((option) => this.selected.has(option))
      .map(({ value }) => this.clone(value));
  }

  private clone(value: ModelChoice): ModelChoice {
    return value === "inherit" ? value : { ...value };
  }

  private move(offset: number): void {
    if (this.filtered.length)
      this.cursor = (this.cursor + offset + this.filtered.length) % this.filtered.length;
  }

  private movePage(direction: number): void {
    const size = this.layout().pageSize;
    const page = Math.floor(this.cursor / size);
    const last = Math.max(0, Math.ceil(this.filtered.length / size) - 1);
    const target = Math.max(0, Math.min(last, page + direction));
    if (target !== page)
      this.cursor = Math.min(this.filtered.length - 1, target * size + (this.cursor % size));
  }
}

export async function selectModel(
  ui: ExtensionUIContext,
  models: readonly AvailableModel[],
  options: Omit<ModelPickerOptions, "multiple">,
): Promise<ModelChoice | undefined> {
  if (!models.length && !options.allowInherit) return undefined;
  const result = await ui.custom<ModelChoice[] | undefined>(
    (tui, theme, keybindings, done) =>
      new ModelPicker(models, options, tui, theme, done, keybindings),
  );
  return result?.[0];
}
