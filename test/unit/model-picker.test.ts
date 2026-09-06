import assert from "node:assert/strict";
import { test } from "node:test";
import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import {
  KeybindingsManager,
  TUI_KEYBINDINGS,
  visibleWidth,
  type TUI,
} from "@earendil-works/pi-tui";
import { ModelPicker, selectModel, type ModelChoice } from "../../src/ui/model-picker.js";
import { ModelMultiSelect } from "../../src/ui/model-multi-select.js";
import type { AvailableModel } from "../../src/core/types.js";

const models: AvailableModel[] = ["openai", "anthropic", "openrouter"].flatMap((provider) =>
  Array.from({ length: 40 }, (_, index) => ({
    ref: { provider, id: `owner/model-${String(index).padStart(2, "0")}` },
    efforts: ["off"],
    images: false,
    contextWindow: 1000,
  })),
);
const theme = {
  fg: (_color: string, value: string) => `\u001b[36m${value}\u001b[0m`,
  bold: (value: string) => `\u001b[1m${value}\u001b[0m`,
} as unknown as ExtensionUIContext["theme"];

function fixture(options: { allowInherit?: boolean; current?: ModelChoice } = {}) {
  let result: ModelChoice[] | undefined | "pending" = "pending";
  const terminal = { rows: 24 };
  const component = new ModelPicker(
    models,
    { title: "Choose a model", ...options },
    { terminal, requestRender() {} } as unknown as TUI,
    theme,
    (value) => {
      result = value;
    },
  );
  return {
    component,
    terminal,
    get result() {
      return result;
    },
  };
}

const modelRows = (component: ModelPicker, width = 80) =>
  component.render(width).filter((line) => line.includes("owner/model-"));

test("single picker paginates a three-provider catalog, wraps arrows and clamps page boundaries", () => {
  const h = fixture();
  assert.equal(modelRows(h.component).length, 8);
  assert.match(h.component.render(80).join("\n"), /Page 1\/15/);
  h.component.handleInput("\u001b[6~");
  assert.match(modelRows(h.component)[0] ?? "", /model-08/);
  h.component.handleInput("\u001b[5~");
  assert.match(modelRows(h.component)[0] ?? "", /model-00/);
  h.component.handleInput("\u001b[A");
  assert.match(h.component.render(80).join("\n"), /Page 15\/15/);
  h.component.handleInput("\u001b[6~");
  assert.match(h.component.render(80).join("\n"), /Page 15\/15/);
  h.component.handleInput("\u001b[B");
  assert.match(h.component.render(80).join("\n"), /Page 1\/15/);
});

test("type-to-search ranks fuzzy provider/model tokens and returns the exact ref", () => {
  const h = fixture();
  h.component.handleInput("\u001b[6~");
  for (const char of "OPNRT/mdl39") h.component.handleInput(char);
  assert.equal(modelRows(h.component).length, 1);
  assert.match(h.component.render(80).join("\n"), /Page 1\/1/);
  h.component.handleInput("\r");
  assert.deepEqual(h.result, [{ provider: "openrouter", id: "owner/model-39" }]);
  assert.notEqual(Array.isArray(h.result) ? h.result[0] : undefined, models.at(-1)?.ref);
});

test("search handles printable navigation letters, slash IDs, backspace, no matches and clear", () => {
  const h = fixture();
  for (const char of "j/kHL") h.component.handleInput(char);
  assert.match(h.component.render(80).join("\n"), /j\/kHL/);
  assert.match(h.component.render(80).join("\n"), /No matching models/);
  h.component.handleInput("\r");
  assert.equal(h.result, "pending");
  h.component.handleInput("\u007f");
  assert.match(h.component.render(80).join("\n"), /j\/kH/);
  h.component.handleInput("\u0015");
  assert.equal(modelRows(h.component).length, 8);
  h.component.handleInput("openai model-00");
  h.component.handleInput("\r");
  assert.deepEqual(h.result, [models[0]?.ref]);
});

test("inherited default is searchable; current exact model opens focused without changing catalog", () => {
  const h = fixture({ allowInherit: true, current: models.at(-1)?.ref });
  h.component.handleInput("\r");
  assert.deepEqual(h.result, [models.at(-1)?.ref]);
  const inherited = fixture({ allowInherit: true });
  inherited.component.handleInput("inherit");
  inherited.component.handleInput("\r");
  assert.deepEqual(inherited.result, ["inherit"]);
});

test("Escape and Ctrl+C cancel immediately even with an active query", () => {
  for (const key of ["\u001b", "\u0003"]) {
    const h = fixture();
    h.component.handleInput("openai");
    h.component.handleInput(key);
    assert.equal(h.result, undefined);
  }
});

test("both pickers fit display-cell widths and shrink pages on terminal resize", () => {
  const terminal = { rows: 24 };
  const tui = { terminal, requestRender() {} } as unknown as TUI;
  const unicode = models.map((model) => ({
    ...model,
    ref: { ...model.ref, id: `模型🤖${"長".repeat(100)}` },
  }));
  const pickers = [
    new ModelPicker(unicode, { title: "模型 ".repeat(50) }, tui, theme, () => undefined),
    new ModelMultiSelect(unicode, tui, theme, () => undefined),
  ];
  for (const picker of pickers) {
    picker.handleInput("\u001b[6~");
    for (const rows of [40, 24, 12, 8, 5]) {
      terminal.rows = rows;
      for (const width of [1, 8, 20, 40, 80, 120]) {
        const lines = picker.render(width);
        assert.ok(lines.length <= Math.max(1, rows - 4));
        assert.ok(
          lines.every((line) => visibleWidth(line) <= width),
          `width ${width}, rows ${rows}`,
        );
        assert.ok(
          lines.some((line) => line.includes(">")),
          "focus remains visible after resize",
        );
      }
    }
  }
});

test("picker forwards focus to Pi Input and honors injected/Kitty navigation bindings", () => {
  const kb = new KeybindingsManager(TUI_KEYBINDINGS, { "tui.select.down": "ctrl+n" });
  let result: unknown;
  const h = new ModelPicker(
    models,
    { title: "Choose" },
    { requestRender() {} } as unknown as TUI,
    theme,
    (value) => {
      result = value;
    },
    kb,
  );
  h.focused = true;
  assert.equal(h.focused, true);
  assert.ok(h.render(80).some((line) => line.includes("\u001b_pi:c")));
  h.focused = false;
  assert.ok(h.render(80).every((line) => !line.includes("\u001b_pi:c")));
  h.handleInput("\u000e");
  h.handleInput("\u001b[13u");
  assert.deepEqual(result, [models[1]?.ref]);
});

test("empty catalogs are safe, and only default editing permits inherit without models", async () => {
  const ui = {
    custom: () => {
      throw new Error("should not open");
    },
  } as unknown as ExtensionUIContext;
  assert.equal(await selectModel(ui, [], { title: "Choose" }), undefined);
  let result: unknown = "pending";
  const h = new ModelPicker(
    [],
    { title: "Choose", allowInherit: true },
    { requestRender() {} } as unknown as TUI,
    theme,
    (value) => {
      result = value;
    },
  );
  h.handleInput("\r");
  assert.deepEqual(result, ["inherit"]);
  const empty = new ModelPicker(
    [],
    { title: "Choose" },
    { requestRender() {} } as unknown as TUI,
    theme,
    () => {
      throw new Error("empty selection");
    },
  );
  for (const key of ["\u001b[A", "\u001b[B", "\u001b[5~", "\u001b[6~", "\r"])
    empty.handleInput(key);
  assert.match(empty.render(80).join("\n"), /No matching models/);
});
