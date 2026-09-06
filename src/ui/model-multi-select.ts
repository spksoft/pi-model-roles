import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import type { KeybindingsManager, TUI } from "@earendil-works/pi-tui";
import { AUTO_SETUP_LIMITS } from "../auto-setup/limits.js";
import type { AvailableModel, ModelRef } from "../core/types.js";
import { ModelPicker } from "./model-picker.js";

export class ModelMultiSelect extends ModelPicker {
  constructor(
    models: readonly AvailableModel[],
    tui: TUI,
    theme: ExtensionUIContext["theme"],
    done: (value: ModelRef[] | undefined) => void,
    keybindings?: KeybindingsManager,
  ) {
    super(
      models,
      { title: "Select models for Auto Setup", multiple: AUTO_SETUP_LIMITS.candidates },
      tui,
      theme,
      (values) => done(values?.filter((value): value is ModelRef => value !== "inherit")),
      keybindings,
    );
  }

  override values(): ModelRef[] {
    return super.values().filter((value): value is ModelRef => value !== "inherit");
  }
}

export async function selectModels(
  ui: ExtensionUIContext,
  models: readonly AvailableModel[],
): Promise<ModelRef[] | undefined> {
  if (!models.length) return undefined;
  return ui.custom<ModelRef[] | undefined>(
    (tui, theme, keybindings, done) => new ModelMultiSelect(models, tui, theme, done, keybindings),
  );
}
