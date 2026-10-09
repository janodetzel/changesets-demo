import { test } from "node:test";
import assert from "node:assert/strict";
import { health } from "./index.js";

test("health is ok", () => {
  assert.deepEqual(health(), { status: "ok" });
});
