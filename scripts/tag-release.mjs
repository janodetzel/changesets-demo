// Runs on every push to main: tags each package version that has no tag yet
// (`changeset publish` only tags here, since every package is private), creates
// a GitHub release per new tag, and writes the new "name@version" list to the job
// output `released`. After an ordinary merge nothing is new; after the Version
// Packages PR, the bumped packages are.
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { workspacePackages } from "./lib/workspace.mjs";

const run = (cmd, args) => (execFileSync(cmd, args, { encoding: "utf8" }) ?? "").trim();
const tags = () => new Set(run("git", ["tag", "--list"]).split("\n").filter(Boolean));

run("git", ["fetch", "--tags", "--force", "origin"]);
const before = tags();
run("pnpm", ["exec", "changeset", "publish"]);
const created = [...tags()].filter((tag) => !before.has(tag));

for (const tag of created) {
  run("git", ["push", "origin", `refs/tags/${tag}`]);
  const name = tag.slice(0, tag.lastIndexOf("@"));
  const { dir } = workspacePackages().find((pkg) => pkg.name === name);
  // The newest section of the package's changelog, without its "## <version>" heading.
  const changelog = readFileSync(join(dir, "CHANGELOG.md"), "utf8").split(/^## /m)[1] ?? "";
  const notes = changelog.slice(changelog.indexOf("\n") + 1).trim() || "No changelog entry.";
  run("gh", ["release", "create", tag, "--title", tag, "--notes", notes, "--verify-tag"]);
  console.log(`released ${tag}`);
}
if (created.length === 0) console.log("No new versions.");
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `released=${created.join(" ")}\n`);
