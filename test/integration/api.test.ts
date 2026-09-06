import assert from "node:assert/strict";
import { test } from "node:test";
import { createEventBus } from "@earendil-works/pi-coding-agent";
import {
  registerSelectionService,
  SELECT_EVENT,
  selectViaEvents,
  type SelectionEvent,
} from "../../src/api/events.js";
import { selectModelForTask } from "../../src/core/selection.js";
import { request, dependencies } from "../support/fixtures.js";
test("versioned bus targets exactly one session and preserves explicit pins", async () => {
  const bus = createEventBus();
  let a = 0;
  let b = 0;
  const disposeA = registerSelectionService(bus, "a", (input) => {
    a++;
    return selectModelForTask(input, dependencies());
  });
  const disposeB = registerSelectionService(bus, "b", (input) => {
    b++;
    return selectModelForTask(input, dependencies());
  });
  const result = await selectViaEvents(bus, "b", request({ explicitEffort: "low" }));
  assert.equal(result.reason, "explicit");
  assert.equal(a, 0);
  assert.equal(b, 1);
  assert.equal((await selectViaEvents(bus, "missing", request())).status, "unavailable");
  const invalid = { version: 2, sessionId: "a", request: request() } as unknown as SelectionEvent;
  bus.emit(SELECT_EVENT, invalid);
  assert.equal((await invalid.result)?.reason, "invalid_request");
  disposeA();
  disposeB();
});
test("duplicate owners do not duplicate requests; shutdown settles non-cooperative service", async () => {
  const bus = createEventBus();
  let count = 0;
  const first = registerSelectionService(bus, "a", () => {
    count++;
    return new Promise(() => {});
  });
  const second = registerSelectionService(bus, "a", (input) => {
    count++;
    return selectModelForTask(input, dependencies());
  });
  const pending = selectViaEvents(bus, "a", request());
  await Promise.resolve();
  first();
  assert.equal((await pending).status, "cancelled");
  assert.equal(count, 1);
  second();
});
