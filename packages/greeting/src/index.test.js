import { test } from "node:test";
import assert from "node:assert/strict";
import { greet } from "./index.js";

test("greet names the person", () => {
  assert.equal(greet("Jano"), "Hello, Jano!");
});
