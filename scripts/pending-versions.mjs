// Prints every package version that has no tag yet, one "name@version" per line.
// On the Version Packages PR, that's what merging it will release.
import { execFileSync } from "node:child_process";
import { workspacePackages } from "./lib/workspace.mjs";

const tags = new Set(execFileSync("git", ["tag", "--list"], { encoding: "utf8" }).split("\n"));
for (const pkg of workspacePackages()) {
  const tag = `${pkg.name}@${pkg.version}`;
  if (!tags.has(tag)) console.log(tag);
}
