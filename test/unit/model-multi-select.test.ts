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

test("multi-select fuzzy search filters the list and keeps selections by exact model ref", () => {
  const component = new ModelMultiSelect(
    models,
    { requestRender() {} } as unknown as TUI,
    theme,
    () => undefined,
  );
  component.handleInput("/");
  component.handleInput("8");
  assert.match(component.render(80).join("\n"), /model-8/);
  assert.doesNotMatch(component.render(80).join("\n"), /model-7/);
  component.handleInput(" ");
  assert.deepEqual(component.values(), [{ provider: "fixture", id: "model-8" }]);
});

test("multi-select renders one fixed-size page and supports page navigation", () => {
  const manyModels = Array.from({ length: 17 }, (_, index) => ({
    ref: { provider: "fixture", id: `page-model-${index}` },
    efforts: ["off"] as const,
    images: false,
    contextWindow: 1,
  }));
  const component = new ModelMultiSelect(
    manyModels,
    { requestRender() {} } as unknown as TUI,
    theme,
    () => undefined,
  );
  const firstPage = component.render(80).join("\n");
  assert.match(firstPage, /Page 1\/3 · 1–8 of 17/);
  assert.match(firstPage, /page-model-7/);
  assert.doesNotMatch(firstPage, /page-model-8/);
  component.handleInput("\u001b[6~");
  const secondPage = component.render(80).join("\n");
  assert.match(secondPage, /Page 2\/3 · 9–16 of 17/);
  assert.match(secondPage, /page-model-8/);
  assert.doesNotMatch(secondPage, /page-model-16/);
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
