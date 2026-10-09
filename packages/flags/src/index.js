// Feature flags, read at runtime. A flag's value is one of:
//   true / false          on or off for everyone
//   { "users": [...] }    on for these user ids only
//   { "percent": 10 }     on for a stable 10% of users (by user id)
// Unknown flags are off, so code can ship before its flag exists.
//
// In this demo the values come from flags/<environment>.json. A real setup reads
// them from a flag service (PostHog, LaunchDarkly, Statsig) or a key-value store
// (Cloudflare KV): only `loadFlags` changes, the `isEnabled` API stays.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function loadFlags(environment = process.env.APP_ENV ?? "development") {
  const file = fileURLToPath(new URL(`../../../flags/${environment}.json`, import.meta.url));
  return JSON.parse(readFileSync(file, "utf8"));
}

export function isEnabled(flags, name, { userId } = {}) {
  const value = flags[name];
  if (typeof value === "boolean") return value;
  if (value && Array.isArray(value.users)) return value.users.includes(userId);
  if (value && typeof value.percent === "number") return userId !== undefined && bucket(`${name}:${userId}`) < value.percent;
  return false;
}

/** A stable number from 0 to 99 for a string. */
function bucket(text) {
  let hash = 0;
  for (const char of text) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % 100;
}
