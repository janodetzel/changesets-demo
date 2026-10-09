import { test } from "node:test";
import assert from "node:assert/strict";
import { isEnabled } from "./index.js";

test("booleans switch a flag for everyone", () => {
  assert.equal(isEnabled({ a: true }, "a"), true);
  assert.equal(isEnabled({ a: false }, "a"), false);
});

test("unknown flags are off", () => {
  assert.equal(isEnabled({}, "missing"), false);
});

test("a user list enables only those users", () => {
  const flags = { a: { users: ["jano"] } };
  assert.equal(isEnabled(flags, "a", { userId: "jano" }), true);
  assert.equal(isEnabled(flags, "a", { userId: "someone" }), false);
});

test("a percentage is stable per user and roughly right", () => {
  const flags = { a: { percent: 30 } };
  const on = Array.from({ length: 1000 }, (_, i) => isEnabled(flags, "a", { userId: `u${i}` })).filter(Boolean).length;
  assert.ok(on > 230 && on < 370, `${on} of 1000`);
  assert.equal(isEnabled(flags, "a", { userId: "u1" }), isEnabled(flags, "a", { userId: "u1" }));
});
