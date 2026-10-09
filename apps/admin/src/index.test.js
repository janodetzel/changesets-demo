import { test } from "node:test";
import assert from "node:assert/strict";
import { home } from "./index.js";

test("home renders a button", () => {
  assert.match(home(), /\( Get started \)/);
});
