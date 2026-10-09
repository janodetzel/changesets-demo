import { test } from "node:test";
import assert from "node:assert/strict";
import { greet } from "./index.js";

test("greet names the person", () => {
  assert.equal(greet("Jano"), "Hello, Jano!");
});

test("an excited greeting has more exclamation marks", () => {
  assert.equal(greet("Jano", { excited: true }), "Hello, Jano!!!");
});
