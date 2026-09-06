import assert from "node:assert/strict";
import { test } from "node:test";
import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import { ModelMultiSelect } from "../../src/ui/model-multi-select.js";

const models = Array.from({ length: 9 }, (_, index) => ({
  ref: { provider: "fixture", id: `model-${index}` },
  efforts: ["off"] as const,
  images: false,
  contextWindow: 1,
}));

const theme = {
  fg: (_color: string, value: string) => value,
  bold: (value: string) => value,
} as unknown as ExtensionUIContext["theme"];

test("multi-select caps selection at eight and returns cloned exact refs", () => {
  let result: unknown;
  let renders = 0;
  const component = new ModelMultiSelect(
    models,
    { requestRender: () => renders++ } as unknown as TUI,
    theme,
    (value) => {
      result = value;
    },
  );
  for (let index = 0; index < 9; index++) {
    component.handleInput(" ");
    component.handleInput("j");
  }
  assert.equal(component.values().length, 8);
  component.handleInput("\r");
  assert.equal(Array.isArray(result), true);
  assert.equal((result as Array<{ id: string }>).length, 8);
  assert.ok(renders > 0);
});

test("multi-select escape cancels and render remains readable", () => {
  let result: unknown = "not-called";
  const component = new ModelMultiSelect(
    models.slice(0, 1),
    { requestRender() {} } as unknown as TUI,
    theme,
    (value) => {
      result = value;
    },
  );
  assert.match(component.render(20).join("\n"), /Select models/);
  component.handleInput("\u001b");
  assert.equal(result, undefined);
});
