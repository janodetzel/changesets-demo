import { test } from "node:test";
import assert from "node:assert/strict";
import { button } from "./index.js";

test("button wraps its label", () => {
  assert.equal(button("Save"), "( Save )");
});
