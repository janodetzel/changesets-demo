import { test } from "node:test";
import assert from "node:assert/strict";
import { checkout, home } from "./index.js";

test("home renders a button", () => {
  assert.match(home(), /\[ Get started \]/);
});

test("the new checkout shows only where its flag is on", () => {
  assert.match(checkout({ flags: { "new-checkout": true } }), /Pay in one tap/);
  assert.match(checkout({ flags: { "new-checkout": false } }), /\[ Pay \]/);
  assert.match(checkout({ flags: {} }), /\[ Pay \]/);
});
